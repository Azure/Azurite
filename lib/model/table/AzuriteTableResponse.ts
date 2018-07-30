import * as uuid from "uuid";
import N from "./../../core/HttpHeaderNames";

class AzuriteTableResponse {
  private httpProps: any;
  constructor(public proxy: any, public payload?: any) {
    this.httpProps[N.VERSION] = "2016-05-31";
    this.httpProps[N.DATE] = new Date().toUTCString();
    this.httpProps[N.REQUEST_ID] = uuid.v1();
    this.payload = payload;
  }

  public addHttpProperty(key, value) {
    if (value !== undefined) {
      this.httpProps[key] = value;
    }
  }
}

export default AzuriteTableResponse;
