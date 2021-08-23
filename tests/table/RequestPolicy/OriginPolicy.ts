import { SendRequest, PipelineRequest, PipelineResponse } from "@azure/core-rest-pipeline";


export default class OriginPolicy {
  // Constructor to accept parameters
  private origin: string | undefined;
  name: string;

  constructor(name: string, origin?: string) {
    this.name = name;
    this.origin = origin;
  }

  async sendRequest(request: PipelineRequest, next: SendRequest): Promise<PipelineResponse> {

    request.headers.set("Origin", `${this.origin}`);

    const response = await next(request);
    return response;
  }
}