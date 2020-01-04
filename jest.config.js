module.exports = {
  testEnvironment: "node",
  coverageDirectory: "dist/jest/coverage",
  collectCoverageFrom: ["<rootDir>/src/**"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
  ],
  moduleNameMapper: {
    "^root": "<rootDir>",
    "^src": "<rootDir>/src",
    "^lib": "<rootDir>/src/lib",
  },
}