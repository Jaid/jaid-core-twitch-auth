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
 * @param {import("jaid-core").ModelDefinitionContext} context
 * @return {{default, schema}}
 */
export default (Model, {parentPlugin, core}) => {

  class TwitchUser extends Model {

    /**
     * @param {Object<string, import("sequelize").Model>} models
     */
    static associate(models) {
      TwitchUser.hasMany(models.TwitchLogin, {
        foreignKey: {
          allowNull: false,
        },
      })
    }

    /**
     * @param {string} twitchId
     * @return {Promise<TwitchUser>}
     */
    static async findByTwitchId(twitchId) {
      const user = await TwitchUser.findOne({
        where: {twitchId},
      })
      return user
    }

    /**
     * @param {string} twitchLogin
     * @return {Promise<TwitchUser>}
     */
    static async findByTwitchLogin(twitchLogin) {
      const user = await TwitchUser.findOne({
        where: {
          loginName: twitchLogin.toLowerCase(),
        },
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
     * @param {string} twitchLogin
     * @param {Object} [options]
     * @return {Promise<TwitchUser>}
     */
    static async findOrRegisterByLogin(twitchLogin, options) {
      return TwitchUser.findOrRegister({
        ...options,
        key: "twitchLogin",
        value: twitchLogin,
      })
    }

    /**
     * @param {string} twitchLogin
     * @param {Object} [options]
     * @param {string[]} options.attributes
     * @param {Object<string, *>} options.defaults
     * @param {"twitchLogin"|"twitchId"} [options.key="twitchLogin"]
     * @param {string} options.value
     * @return {Promise<TwitchUser>}
     */
    static async findOrRegister({key = "twitchLogin", value, attributes, defaults}) {
      const keyMeta = {
        twitchLogin: {
          searchColumn: "loginName",
          fetchUser: twitchLogin => twitchCore.getUserInfoByTwitchLogin(twitchLogin),
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
      if (key === "twitchLogin") {
        const twitchUserWithSameId = await TwitchUser.findOne({
          where: {twitchId: helixUser.id},
        })
        if (twitchUserWithSameId) {
          parentPlugin.logInfo("Twitch user #%s seems to have been renamed from %s to %s", twitchUserWithSameId.id, twitchUserWithSameId.loginName, value)
          twitchUserWithSameId.loginName = value
          twitchUserWithSameId.displayName = displayName
          await twitchUserWithSameId.save()
          return twitchUserWithSameId
        }
      }
      parentPlugin.logInfo("New Twitch user %s", displayName)
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
     * @typedef {Object} CreateFromLoginResult
     */

    /**
     * @param {string} accessToken
     * @param {string} refreshToken
     * @param {Object} profile
     * @return {Promise<CreateFromLoginResult>}
     */
    static async createFromLogin(accessToken, refreshToken, profile) {
      const twitchUser = await TwitchUser.create({
        broadcasterType: profile.broadcaster_type,
        description: profile.description,
        displayName: profile.display_name,
        twitchId: profile.id,
        loginName: profile.login,
        offlineImageUrl: profile.offline_image_url,
        avatarUrl: profile.profile_image_url,
        viewCount: profile.view_count,
        twitchLogins: [
          {
            accessToken,
            refreshToken,
          },
        ],
      }, {
        include: core.database.models.TwitchLogin,
      })
      return {
        twitchUser,
      }
    }

    /**
     * @return {Promise<import("twitch").default>}
     */
    async toTwitchClient() {
      const client = await twitch.withCredentials(config.twitchClientId, this.accessToken, scope, {
        clientSecret: config.twitchClientSecret,
        refreshToken: this.refreshToken,
        onRefresh: accessToken => this.updateToken(accessToken),
        expiry: this.tokenExpiryDate,
      }, {
        preAuth: true,
        initialScopes: scope,
      })
      if (!this.tokenExpiryDate) {
        parentPlugin.logInfo("Initial expiry date not set for user %s. Forcing access token refresh.", this.loginName)
        await client.refreshAccessToken()
      }
      parentPlugin.logInfo("Created client for user %s", this.loginName)
      return client
    }

    /**
     * @param {boolean} [connect = true]
     * @return {Promise<TwitchClientWithChat>}
     */
    async toTwitchClientWithChat(connect = true) {
      const apiClient = await this.toTwitchClient()
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
     * @param {import("twitch").AccessToken} token
     * @return {Promise<void>}
     */
    async updateToken(token) {
      parentPlugin.log("Refresh token of user %s", this.loginName)
      this.accessToken = token.accessToken
      this.refreshToken = token.refreshToken
      this.tokenExpiryDate = token.expiryDate
      await this.save({
        fields: ["accessToken", "refreshToken", "tokenExpiryDate"],
      })
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