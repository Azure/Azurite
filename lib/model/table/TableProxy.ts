import BaseProxy from "./BaseProxy";

class TableProxy extends BaseProxy {
  public name: any;
  constructor(entity) {
    super(entity);
    this.name = entity.name;
  }
}

export default TableProxy;
