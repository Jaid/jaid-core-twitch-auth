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
     * @param {Object<string, import("sequelize").Model>} models
     */
    static associate() {
      TwitchUser.hasMany(models.TwitchToken, {
        foreignKey: {
          allowNull: false,
        },
      })
    }

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
     * @param {string} twitchToken
     * @param {import("sequelize").FindOptions} queryOptions
     * @return {Promise<TwitchUser>}
     */
    static async findByTwitchToken(twitchToken, queryOptions) {
      const user = await TwitchUser.findOne({
        where: {
          loginName: twitchToken.toLowerCase(),
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
      return TwitchUser.findOrRegister({
        ...options,
        key: "twitchId",
        value: twitchId,
      })
    }

    /**
     * @param {string} twitchToken
     * @param {Object} [options]
     * @return {Promise<TwitchUser>}
     */
    static async findOrRegisterByLogin(twitchToken, options) {
      return TwitchUser.findOrRegister({
        ...options,
        key: "twitchToken",
        value: twitchToken,
      })
    }

    /**
     * @param {string} twitchToken
     * @param {Object} [options]
     * @param {string[]} options.attributes
     * @param {Object<string, *>} options.defaults
     * @param {"twitchToken"|"twitchId"} [options.key="twitchToken"]
     * @param {string} options.value
     * @return {Promise<TwitchUser>}
     */
    static async findOrRegister({key = "twitchToken", value, attributes, defaults}) {
      const keyMeta = {
        twitchToken: {
          searchColumn: "loginName",
          fetchUser: twitchToken => twitchCore.getUserInfoByTwitchToken(twitchToken),
        },
        twitchId: {
          searchColumn: "twitchId",
          fetchUser: twitchId => twitchCore.getUserInfoByTwitchId(twitchId),
        },
      }
      const twitchUser = await TwitchUser.findOne({
        where: {[keyMeta[key].searchColumn]: value},
        attributes,
      })
      if (twitchUser) {
        return twitchUser
      }
      const helixUser = await keyMeta[key].fetchUser(value)
      const login = helixUser.name.toLowerCase()
      const displayName = helixUser.displayName || login
      if (key === "twitchToken") {
        const twitchUserWithSameId = await TwitchUser.findOne({
          where: {twitchId: helixUser.id},
        })
        if (twitchUserWithSameId) {
          parentPlugin.log("Twitch user #%s seems to have been renamed from %s to %s", twitchUserWithSameId.id, twitchUserWithSameId.loginName, value)
          twitchUserWithSameId.loginName = value
          twitchUserWithSameId.displayName = displayName
          await twitchUserWithSameId.save()
          return twitchUserWithSameId
        }
      }
      parentPlugin.log("New Twitch user %s", displayName)
      const isNameSlugUsed = await User.isSlugInUse(login)
      let newSlug = login
      if (isNameSlugUsed) {
        newSlug = shortid.generate()
        parentPlugin.logWarn("Can not use %s for user slug, because is it already in use, using random slug %s instead", login, newSlug)
      }
      const newTwitchUser = await TwitchUser.create({
        displayName,
        twitchId: helixUser.id,
        description: helixUser.description,
        loginName: login,
        offlineImageUrl: helixUser.offlinePlaceholderUrl,
        avatarUrl: helixUser.profilePictureUrl,
        viewCount: helixUser.views,
        broadcasterType: helixUser.broadcasterType,
        User: {
          title: displayName,
          color: defaults?.nameColor,
          slug: newSlug,
        },
        ...defaults,
      }, {include: "User"})
      return newTwitchUser
    }

    /**
     * @param {string} accessToken
     * @param {string} refreshToken
     * @param {import("@oauth-everything/passport-twitch").Profile} profile
     * @return {Promise<TwitchUser>}
     */
    static async createFromLogin(accessToken, refreshToken, profile) {
      // eslint-disable-next-line no-underscore-dangle
      const rawProfile = profile._json.data[0]
      const twitchUser = await TwitchUser.create({
        broadcasterType: rawProfile.broadcaster_type,
        description: profile.aboutMe,
        displayName: profile.displayName,
        twitchId: profile.id,
        loginName: profile.username,
        offlineImageUrl: rawProfile.offline_image_url,
        avatarUrl: rawProfile.profile_image_url,
        viewCount: rawProfile.view_count,
        TwitchTokens: [
          {
            accessToken,
            refreshToken,
          },
        ],
      }, {
        include: [
          {
            model: models.TwitchToken,
            as: "TwitchTokens",
          },
        ],
      })
      return twitchUser
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
        parentPlugin.log("Initial expiry date not set for user %s. Forcing access token refresh.", this.loginName)
        await client.refreshAccessToken()
      }
      parentPlugin.log("Created client for user %s", this.loginName)
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
     * @return {Promise<void>}
     */
    async updateToken(token, queryOptions) {
      await models.TwitchToken.create({
        TwitchUserId: this.id,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiryDate: token.expiryDate,
      }, queryOptions)
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
    broadcasterType: Sequelize.STRING(16),
    description: Sequelize.STRING,
    twitchId: {
      type: Sequelize.STRING(16),
      unique: true,
      allowNull: false,
    },
    displayName: Sequelize.STRING(64),
    loginName: {
      allowNull: false,
      unique: true,
      type: Sequelize.STRING(64),
    },
    offlineImageUrl: Sequelize.TEXT,
    avatarUrl: Sequelize.TEXT,
    viewCount: {
      allowNull: false,
      type: Sequelize.INTEGER,
    },
    accessToken: Sequelize.STRING,
    refreshToken: Sequelize.STRING,
    tokenExpiryDate: Sequelize.DATE,
  }

  return {
    schema,
    default: TwitchUser,
  }

}