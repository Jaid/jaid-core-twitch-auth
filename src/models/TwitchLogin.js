import Sequelize from "sequelize"

/**
 * @param {typeof import("sequelize").Model} Model
 * @param {import("jaid-core").ModelDefinitionContext} context
 * @return {{default, schema}}
 */
export default (Model, {models}) => {

  class TwitchLogin extends Model {

    /**
     * @param {Object<string, import("sequelize").Model>} models
     */
    static associate() {
      TwitchLogin.belongsTo(models.TwitchToken, {
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
    ip: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    userAgent: Sequelize.STRING,
  }

  return {
    schema,
    default: TwitchLogin,
  }

}