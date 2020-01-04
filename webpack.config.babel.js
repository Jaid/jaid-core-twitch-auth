import configure from "webpack-config-jaid"

export default configure({
  documentation: true,
  extra: {devtool: "inline-source-map"},
})