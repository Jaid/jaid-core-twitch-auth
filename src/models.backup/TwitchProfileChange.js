import Sequelize from "sequelize"

class TwitchProfileChange extends Sequelize.Model {

  static associate(models) {
    // TwitchProfileChange.belongsTo(models.TwitchUser, {
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

export default TwitchProfileChange