import hasContent from "has-content"
import {omit, pick} from "lodash"
import objectChanges from "object-changes"
import Sequelize from "sequelize"
import twitch from "twitch"
import twitchChatClient from "twitch-chat-client"

/**
 * @typedef {Object} TwitchClientWithChat
 * @prop {import("twitch").default} apiClient
 * @prop {import("twitch-chat-client").default} chatClient
 */

/**
 * @param {typeof import("sequelize").Model} Model
 * @param {import("jaid-core").ModelDefinitionContext & {parentPlugin: import("src").default}} context
 * @return {{default, schema}}
 */
export default (Model, {parentPlugin, models}) => {

  class TwitchUser extends Model {

    /**
     * @param {string} twitchId
     * @param {import("sequelize").FindOptions} queryOptions
     * @return {Promise<TwitchUser>}
     */
    static async findByTwitchId(twitchId, queryOptions) {
      const user = await TwitchUser.findOne({
        where: {twitchId},
        ...queryOptions,
      })
      return user
    }

    /**
     * @param {string} twitchLogin
     * @param {import("sequelize").FindOptions} queryOptions
     * @return {Promise<TwitchUser>}
     */
    static async findByTwitchLogin(twitchLogin, queryOptions) {
      const user = await TwitchUser.findOne({
        where: {
          loginName: twitchLogin.toLowerCase(),
        },
        ...queryOptions,
      })
      return user
    }

    /**
     * @param {string} twitchId
     * @param {Object} [options]
     * @return {Promise<TwitchUser>}
     */
    static async findOrRegisterById(twitchId, options) {
      const profile = await parentPlugin.apiClient.helix.users.getUserById(twitchId)
      return TwitchUser.findOrRegister({
        ...options,
        key: "twitchId",
        value: twitchId,
        profile,
      })
    }

    /**
     * @param {string} loginName
     * @param {Object} [options]
     * @return {Promise<TwitchUser>}
     */
    static async findOrRegisterByLogin(loginName, options) {
      const helixUser = await parentPlugin.apiClient.helix.users.getUserByName(loginName)
      return TwitchUser.findOrRegister({
        ...options,
        key: "loginName",
        value: loginName.toLowerCase(),
        helixUser,
      })
    }

    /**
     * @param {Object} [options]
     * @param {import("twitch").HelixUser} options.helixUser
     * @param {"loginName"|"twitchId"} [options.key="twitchToken"]
     * @param {string} options.value
     * @return {Promise<TwitchUser>}
     */
    static async findOrRegister({key = "loginName", helixUser, value}) {
      const twitchUser = await TwitchUser.findOne({
        where: {[key]: value},
      })
      const properties = TwitchUser.getProfilePropertiesFromHelixUser(helixUser)
      if (twitchUser) {
        await twitchUser.applyChanges(properties)
        return twitchUser
      }
      const login = helixUser.name.toLowerCase()
      const displayName = helixUser.displayName || login
      if (key === "loginName") {
        const twitchUserWithSameId = await TwitchUser.findByTwitchId(helixUser.id)
        if (twitchUserWithSameId) {
          parentPlugin.log(`Twitch user #${twitchUserWithSameId.id} seems to have been renamed from ${twitchUserWithSameId.loginName} to ${value}`)
          properties.displayName = displayName
          properties.loginName = value
          await twitchUserWithSameId.applyChanges(properties)
          return twitchUserWithSameId
        }
      }
      parentPlugin.log(`New Twitch user ${displayName}`)
      const newTwitchUser = await TwitchUser.create({
        displayName,
        ...properties,
      })
      return newTwitchUser
    }

    /**
     * @param {string} accessToken
     * @param {string} refreshToken
     * @param {import("@oauth-everything/passport-twitch").Profile} profile
     * @return {Promise<Object>}
     */
    static async createFromLogin(accessToken, refreshToken, profile) {
      const profileProperties = TwitchUser.getProfilePropertiesFromProfile(profile)
      const twitchUser = await TwitchUser.create(profileProperties)
      const twitchToken = await models.TwitchToken.create({
        TwitchUserId: twitchUser.id,
        accessToken,
        refreshToken,
      })
      return {
        twitchUser,
        twitchToken,
      }
    }

    /**
     * @param {import("@oauth-everything/passport-twitch").Profile} profile
     * @return {Object}
     */
    static getProfilePropertiesFromProfile(profile) {
      // eslint-disable-next-line no-underscore-dangle
      const rawProfile = profile._json.data[0]
      return {
        userType: rawProfile.type,
        broadcasterType: rawProfile.broadcaster_type,
        description: profile.aboutMe,
        displayName: profile.displayName || profile.username,
        twitchId: profile.id,
        loginName: profile.username.toLowerCase(),
        offlineImageUrl: rawProfile.offline_image_url,
        avatarUrl: rawProfile.profile_image_url,
        viewCount: rawProfile.view_count,
      }
    }

    /**
     * @param {import("twitch").HelixUser} helixUser
     * @return {Object}
     */
    static getProfilePropertiesFromHelixUser(helixUser) {
      return {
        userType: helixUser.type,
        broadcasterType: helixUser.broadcasterType,
        description: helixUser.description,
        displayName: helixUser.displayName || helixUser.name,
        twitchId: helixUser.id,
        loginName: helixUser.name.toLowerCase(),
        offlineImageUrl: helixUser.offlinePlaceholderUrl,
        avatarUrl: helixUser.profilePictureUrl,
        viewCount: helixUser.views,
      }
    }

    /**
     * @return {Object}
     */
    getProfileProperties() {
      return omit(this.dataValues, ["id", "createdAt", "updatedAt"])
    }

    /**
     * @return {Promise<import("twitch").default>}
     */
    async toTwitchClient() {
      const twitchToken = await this.getToken()
      if (!twitchToken) {
        return null
      }
      const scope = parentPlugin.options.scope
      const client = await twitch.withCredentials(parentPlugin.clientId, twitchToken.accessToken, scope, {
        clientSecret: parentPlugin.clientSecret,
        refreshToken: twitchToken.refreshToken,
        expiry: twitchToken.expiryDate,
        onRefresh: accessToken => this.updateToken(accessToken),
      }, {
        preAuth: true,
        initialScopes: scope,
      })
      if (!twitchToken.tokenExpiryDate) {
        parentPlugin.log(`Initial expiry date not set for user ${this.loginName}. Forcing access token refresh.`)
        await client.refreshAccessToken()
      }
      parentPlugin.log(`Created client for user ${this.loginName}`)
      return client
    }

    /**
     * @param {boolean} [connect = true]
     * @return {Promise<TwitchClientWithChat>}
     */
    async toTwitchClientWithChat(connect = true) {
      const apiClient = await this.toTwitchClient()
      if (!apiClient) {
        return null
      }
      const chatClient = await twitchChatClient.forTwitchClient(apiClient)
      if (connect) {
        await chatClient.connect()
        await chatClient.waitForRegistration()
      }
      return {
        apiClient,
        chatClient,
      }
    }

    /**
     * @return {Promise<Object>}
     */
    async getToken() {
      /**
       * @type {import("sequelize").ModelCtor<{}>}
       */
      const TwitchToken = models.TwitchToken
      const twitchToken = await TwitchToken.findOne({
        where: {
          TwitchUserId: this.id,
        },
        order: [["id", "DESC"]],
        raw: true,
        attributes: [
          "accessToken",
          "refreshToken",
          "expiryDate",
        ],
      })
      if (!twitchToken) {
        return null
      }
      return twitchToken
    }

    /**
     * @param {import("twitch").AccessToken} token
     * @param {import("sequelize").CreateOptions} queryOptions
     * @return {Promise<Object>}
     */
    async updateToken(token, queryOptions) {
      return models.TwitchToken.create({
        TwitchUserId: this.id,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiryDate: token.expiryDate,
      }, queryOptions)
    }

    /**
     * @param {import("twitch").AccessToken} token
     * @param {import("sequelize").CreateOptions} queryOptions
     * @return {Promise<Object>}
     */
    async createToken(accessToken, refreshToken, queryOptions) {
      return models.TwitchToken.create({
        accessToken,
        refreshToken,
        TwitchUserId: this.id,
      }, queryOptions)
    }

    /**
     * @param {import("@oauth-everything/passport-twitch").Profile} profile
     * @return {Promise<Object>}
     */
    async applyProfileChanges(profile) {
      const newProperties = TwitchUser.getProfilePropertiesFromProfile(profile)
      return this.applyChanges(newProperties)
    }

    /**
     * @param {Object} newProperties
     * @return {Promise<Object>}
     */
    async applyChanges(newProperties) {
      const currentProperties = this.getProfileProperties()
      const changes = objectChanges(currentProperties, newProperties)
      if (hasContent(changes)) {
        await this.update(changes)
        await models.TwitchProfileChange.create({
          newValues: changes,
          previousValues: pick(currentProperties, Object.keys(changes)),
          TwitchUserId: this.id,
        })
      }
      return changes
    }

    /**
     * @return {string}
     */
    getDisplayName() {
      return this.displayName || this.loginName || `#${this.twitchId}`
    }

  }

  /**
   * @type {import("sequelize").ModelAttributes}
   */
  const schema = {
    broadcasterType: Sequelize.STRING(32),
    userType: Sequelize.STRING(32),
    description: Sequelize.TEXT,
    twitchId: {
      type: Sequelize.STRING(16),
      unique: true,
      allowNull: false,
    },
    displayName: {
      allowNull: false,
      type: Sequelize.STRING(64),
    },
    loginName: {
      allowNull: false,
      unique: true,
      type: Sequelize.STRING(64),
    },
    offlineImageUrl: Sequelize.STRING,
    avatarUrl: Sequelize.STRING,
    viewCount: {
      allowNull: false,
      type: Sequelize.INTEGER,
    },
  }

  return {
    schema,
    default: TwitchUser,
  }

}