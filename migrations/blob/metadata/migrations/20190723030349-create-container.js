"use strict";

// http://docs.sequelizejs.com/class/lib/query-interface.js~QueryInterface.html
// sequelize db:migrate
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface
      .createTable("Containers", {
        accountName: {
          type: "VARCHAR(255)"
        },
        containerName: {
          type: "VARCHAR(255)"
        },
        containerId: {
          type: Sequelize.INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true
        },
        lastModified: {
          allowNull: false,
          type: Sequelize.DATE(6)
        },
        etag: {
          allowNull: false,
          type: "VARCHAR(127)"
        },
        metadata: {
          type: "VARCHAR(2047)"
        },
        containerAcl: {
          type: "VARCHAR(1023)"
        },
        publicAccess: {
          type: "VARCHAR(31)"
        },
        hasImmutabilityPolicy: {
          type: Sequelize.BOOLEAN
        },
        hasLegalHold: {
          type: Sequelize.BOOLEAN
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE
        }
      })
      .then(() => {
        return queryInterface.addIndex(
          "Containers",
          ["accountName", "containerName"],
          {
            unique: true
          }
        );
      });
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable("Services");
  }
};
