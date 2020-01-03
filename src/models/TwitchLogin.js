import Sequelize from "sequelize"

class TwitchLogin extends Sequelize.Model {

  static associate(models) {
    // TwitchLogin.belongsTo(models.TwitchUser, {
    //   foreignKey: {
    //     allowNull: false,
    //   },
    // })
  }

}

/**
 * @type {import("sequelize").ModelAttributes}
 */
export const schema = {
  accessToken: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  refreshToken: Sequelize.STRING,
}

export default TwitchLogin