import BbPromise from "bluebird";
import CreateTable from "../../actions/table/CreateTable";
import DeleteEntity from "../../actions/table/DeleteEntity";
import DeleteTable from "../../actions/table/DeleteTable";
import InsertEntity from "../../actions/table/InsertEntity";
import InsertOrMergeEntity from "../../actions/table/InsertOrMergeEntity";
import InsertOrReplaceEntity from "../../actions/table/InsertOrReplaceEntity";
import MergeEntity from "../../actions/table/MergeEntity";
import QueryEntities from "../../actions/table/QueryEntities";
import QueryTable from "../../actions/table/QueryTable";
import UpdateEntity from "../../actions/table/UpdateEntity";
import { Operations } from "../../core/Constants";

export default (req, res) => {
  BbPromise.try(() => {
    actions[req.azuriteOperation](req.azuriteRequest, res);
  }).catch(e => {
    res.status(e.statusCode || 500).send(e.message);
    if (!e.statusCode) {
      throw e;
    }
  });
};

const actions = {};

actions[Operations.Table.CREATE_TABLE] = (request, res) => {
  CreateTable.process(request, res);
};

actions[Operations.Table.INSERT_ENTITY] = (request, res) => {
  InsertEntity.process(request, res);
};

actions[Operations.Table.DELETE_TABLE] = (request, res) => {
  DeleteTable.process(request, res);
};

actions[Operations.Table.DELETE_ENTITY] = (request, res) => {
  DeleteEntity.process(request, res);
};

actions[Operations.Table.QUERY_TABLE] = (request, res) => {
  QueryTable.process(request, res);
};

actions[Operations.Table.QUERY_ENTITY] = (request, res) => {
  QueryEntities.process(request, res);
};

actions[Operations.Table.UPDATE_ENTITY] = (request, res) => {
  UpdateEntity.process(request, res);
};

actions[Operations.Table.INSERT_OR_REPLACE_ENTITY] = (request, res) => {
  InsertOrReplaceEntity.process(request, res);
};

actions[Operations.Table.MERGE_ENTITY] = (request, res) => {
  MergeEntity.process(request, res);
};

actions[Operations.Table.INSERT_OR_MERGE_ENTITY] = (request, res) => {
  InsertOrMergeEntity.process(request, res);
};
