/** @format */

"use strict";

import BaseProxy from './BaseProxy';

class TableProxy extends BaseProxy {
  constructor(entity) {
    super(entity);
    this.name = entity.name;
  }
}

export default TableProxy;
