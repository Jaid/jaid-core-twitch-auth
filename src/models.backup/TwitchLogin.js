import Sequelize from "sequelize"

export default Model => {

  class TwitchLogin extends Model {

    /**
     * @param {Object<string, import("sequelize").Model>} models
     */
    static associate(models) {
      debugger
      TwitchLogin.belongsTo(models.TwitchUser, {
        foreignKey: {
          allowNull: false,
        },
      })
    }

  }

  /**
   * @type {import("sequelize").ModelAttributes}
   */
  const schema = {
    accessToken: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    refreshToken: Sequelize.STRING,
  }

  return {
    schema,
    default: TwitchLogin,
  }

}