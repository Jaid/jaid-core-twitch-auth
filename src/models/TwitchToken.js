import Sequelize from "sequelize"

/**
 * @param {typeof import("sequelize").Model} Model
 * @param {import("jaid-core").ModelDefinitionContext} context
 * @return {{default, schema}}
 */
export default (Model, {models}) => {

  class TwitchToken extends Model {

    /**
     * @param {Object<string, import("sequelize").Model>} models
     */
    static associate() {
      TwitchToken.belongsTo(models.TwitchUser, {
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
    expiryDate: Sequelize.DATE,
  }

  return {
    schema,
    default: TwitchToken,
  }

}