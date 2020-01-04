import Sequelize from "sequelize"

/**
 * @param {typeof import("sequelize").Model} Model
 * @param {import("jaid-core").ModelDefinitionContext} context
 * @return {{default, schema}}
 */
export default Model => {

  class TwitchProfileChange extends Model {

    /**
     * @param {Object<string, import("sequelize").Model>} models
     */
    static associate(models) {
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
    title: {
      type: Sequelize.STRING,
      allowNull: false,
    },
  }

  return {
    default: TwitchProfileChange,
    schema,
  }

}