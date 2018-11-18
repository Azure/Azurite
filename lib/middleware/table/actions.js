/** @format */

"use strict";

const BbPromise = require("bluebird"),
  AError = require("./../../core/AzuriteError"),
  Operations = require("./../../core/Constants").Operations.Table,
  insertEntity = require("./../../actions/table/InsertEntity"),
  deleteTable = require("./../../actions/table/DeleteTable"),
  deleteEntity = require("./../../actions/table/DeleteEntity"),
  queryTable = require("./../../actions/table/QueryTable"),
  queryEntities = require("./../../actions/table/QueryEntities"),
  updateEntity = require("./../../actions/table/UpdateEntity"),
  insertOrReplaceEntity = require("./../../actions/table/InsertOrReplaceEntity"),
  mergeEntity = require("./../../actions/table/MergeEntity"),
  insertOrMergeEntity = require("./../../actions/table/InsertOrMergeEntity"),
  createTable = require("./../../actions/table/CreateTable");

module.exports = (req, res) => {
  BbPromise.try(() => {
    actions[req.azuriteOperation](req.azuriteRequest, res);
  }).catch((e) => {
    if (e instanceof AError) { e.send(res); } else { res.status(e.statusCode || 500).send(e.message); }
    if (!e.statusCode) throw e;
  });
};

const actions = {};

actions[undefined] = (request, res) => {
  res.status(501).send("Not Implemented yet.");
};

actions[Operations.CREATE_TABLE] = (request, res) => {
  createTable.process(request, res);
};

actions[Operations.INSERT_ENTITY] = (request, res) => {
  insertEntity.process(request, res);
};

actions[Operations.DELETE_TABLE] = (request, res) => {
  deleteTable.process(request, res);
};

actions[Operations.DELETE_ENTITY] = (request, res) => {
  deleteEntity.process(request, res);
};

actions[Operations.QUERY_TABLE] = (request, res) => {
  queryTable.process(request, res);
};

actions[Operations.QUERY_ENTITY] = (request, res) => {
  queryEntities.process(request, res);
};

actions[Operations.UPDATE_ENTITY] = (request, res) => {
  updateEntity.process(request, res);
};

actions[Operations.INSERT_OR_REPLACE_ENTITY] = (request, res) => {
  insertOrReplaceEntity.process(request, res);
};

actions[Operations.MERGE_ENTITY] = (request, res) => {
  mergeEntity.process(request, res);
};

actions[Operations.INSERT_OR_MERGE_ENTITY] = (request, res) => {
  insertOrMergeEntity.process(request, res);
};
