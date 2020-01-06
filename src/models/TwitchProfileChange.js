import Sequelize from "sequelize"

/**
 * @param {typeof import("sequelize").Model} Model
 * @param {import("jaid-core").ModelDefinitionContext} context
 * @return {{default, schema}}
 */
export default (Model, {models}) => {

  class TwitchProfileChange extends Model {

    /**
     * @param {Object<string, import("sequelize").Model>} models
     */
    static associate() {
      TwitchProfileChange.belongsTo(models.TwitchUser, {
        foreignKey: {
          allowNull: false,
        },
      })
    }

    /**
     * @return {string}
     */
    getTitle() {
      return this.title
    }

  }

  /**
   * @type {import("sequelize").ModelAttributes}
   */
  const schema = {
    previousValues: {
      type: Sequelize.JSONB,
      allowNull: false,
    },
    newValues: {
      type: Sequelize.JSONB,
      allowNull: false,
    },
  }

  return {
    default: TwitchProfileChange,
    schema,
  }

}