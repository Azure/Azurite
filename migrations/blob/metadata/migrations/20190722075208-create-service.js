"use strict";

// http://docs.sequelizejs.com/class/lib/query-interface.js~QueryInterface.html
// sequelize db:migrate
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable("Services", {
      accountName: {
        type: "VARCHAR(255)",
        primaryKey: true
      },
      defaultServiceVersion: {
        type: "VARCHAR(31)"
      },
      cors: {
        type: "VARCHAR(255)"
      },
      logging: {
        type: "VARCHAR(255)"
      },
      minuteMetrics: {
        type: "VARCHAR(255)"
      },
      hourMetrics: {
        type: "VARCHAR(255)"
      },
      staticWebsite: {
        type: "VARCHAR(255)"
      },
      deleteRetentionPolicy: {
        type: "VARCHAR(255)"
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable("Services");
  }
};
