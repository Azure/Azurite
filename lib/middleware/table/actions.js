/** @format */

"use strict";

import BbPromise from "bluebird";
import insertEntity from "./../../actions/table/InsertEntity";
import deleteTable from "./../../actions/table/DeleteTable";
import deleteEntity from "./../../actions/table/DeleteEntity";
import queryTable from "./../../actions/table/QueryTable";
import queryEntities from "./../../actions/table/QueryEntities";
import updateEntity from "./../../actions/table/UpdateEntity";
import insertOrReplaceEntity from "./../../actions/table/InsertOrReplaceEntity";
import mergeEntity from "./../../actions/table/MergeEntity";
import insertOrMergeEntity from "./../../actions/table/InsertOrMergeEntity";
import createTable from "./../../actions/table/CreateTable";
import { Operations } from "./../../core/Constants";

export default (req, res) => {
  BbPromise.try(() => {
    actions[req.azuriteOperation](req.azuriteRequest, res);
  }).catch((e) => {
    res.status(e.statusCode || 500).send(e.message);
    if (!e.statusCode) throw e;
  });
};

const actions = {};

actions[undefined] = (request, res) => {
  res.status(501).send("Not Implemented yet.");
};

actions[Operations.Table.CREATE_TABLE] = (request, res) => {
  createTable.process(request, res);
};

actions[Operations.Table.INSERT_ENTITY] = (request, res) => {
  insertEntity.process(request, res);
};

actions[Operations.Table.DELETE_TABLE] = (request, res) => {
  deleteTable.process(request, res);
};

actions[Operations.Table.DELETE_ENTITY] = (request, res) => {
  deleteEntity.process(request, res);
};

actions[Operations.Table.QUERY_TABLE] = (request, res) => {
  queryTable.process(request, res);
};

actions[Operations.Table.QUERY_ENTITY] = (request, res) => {
  queryEntities.process(request, res);
};

actions[Operations.Table.UPDATE_ENTITY] = (request, res) => {
  updateEntity.process(request, res);
};

actions[Operations.Table.INSERT_OR_REPLACE_ENTITY] = (request, res) => {
  insertOrReplaceEntity.process(request, res);
};

actions[Operations.Table.MERGE_ENTITY] = (request, res) => {
  mergeEntity.process(request, res);
};

actions[Operations.Table.INSERT_OR_MERGE_ENTITY] = (request, res) => {
  insertOrMergeEntity.process(request, res);
};
