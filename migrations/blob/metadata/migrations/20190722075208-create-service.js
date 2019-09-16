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
        type: "VARCHAR(1023)"
      },
      logging: {
        type: "VARCHAR(1023)"
      },
      minuteMetrics: {
        type: "VARCHAR(1023)"
      },
      hourMetrics: {
        type: "VARCHAR(1023)"
      },
      staticWebsite: {
        type: "VARCHAR(1023)"
      },
      deleteRetentionPolicy: {
        type: "VARCHAR(1023)"
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
