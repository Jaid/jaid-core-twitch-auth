import Sequelize from "sequelize"

/**
 * @typedef {Object} TwitchClientWithChat
 * @prop {import("twitch").default} apiClient
 * @prop {import("twitch-chat-client").default} chatClient
 */

export default Model => {

  class TwitchUser extends Model {

    static associate(models) {
      console.log("TwitchUser ", Object.keys(models))
      // TwitchUser.hasMany(models.TwitchLogin, {
      //   foreignKey: {
      //     allowNull: false,
      //   },
      // })
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