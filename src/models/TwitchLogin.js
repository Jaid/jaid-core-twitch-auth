import Sequelize from "sequelize"

/**
 * @param {typeof import("sequelize").Model} Model
 * @param {import("jaid-core").ModelDefinitionContext} context
 * @return {{default, schema}}
 */
export default Model => {

  class TwitchLogin extends Model {

    /**
     * @param {Object<string, import("sequelize").Model>} models
     */
    static associate(models) {
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