import Sequelize from "sequelize";

class Project extends Sequelize.Model {}
Project.init(
  {
    title: Sequelize.STRING,
    description: Sequelize.TEXT
  },
  { sequelize, modelName: "project" }
);
