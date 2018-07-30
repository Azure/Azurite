import { ODataMode } from "../../core/Constants";
import InternalAzuriteError from "../../core/InternalAzuriteError";

class BaseProxy {
  constructor(private entity: any) {}

  /**
   * Returns the odata representation of the any (Table, Entity) entity.
   *
   * @param {any} odata is (nometadata|minimalmetadata|fullmetadata)
   * @returns
   * @memberof TableProxy
   */
  public odata(mode) {
    switch (mode) {
      case ODataMode.NONE:
        return {
          TableName: this.entity.name
        };
        break;
      case ODataMode.MINIMAL:
        return {
          TableName: this.entity.name,
          "odata.metadata": this.entity.odata.metadata
        };
        break;
      case ODataMode.FULL:
        return {
          TableName: this.entity.name,
          "odata.editLink": this.entity.odata.editLink,
          "odata.id": this.entity.odata.id,
          "odata.metadata": this.entity.odata.metadata,
          "odata.type": this.entity.odata.type
        };
        break;
      default:
        throw new InternalAzuriteError(
          `TableProxy: Unsupported OData type "${mode}".`
        );
    }
  }
}

export default BaseProxy;
