/**
 * This interface defines the required functions of TableEnvironment given command line parameter
 */
export default interface ITableEnvironment {
  tableHost(): string | undefined;                      // Optional. Customize listening address for table
  tablePort(): number | undefined;                      // Optional. Customize listening port for table
  location(): Promise<string>;                          // Optional. Use an existing folder as workspace path,
                                                        //           default is current working directory
  silent(): boolean;                                    // Optional. Disable access log displayed in console
  loose(): boolean;                                     // Optional. Enable loose mode which 
                                                        //    ignores unsupported headers and parameters
  skipApiVersionCheck(): boolean;                       // Optional. Skip the request API version check,
                                                        //     request with all Api versions will be allowed
  debug(): Promise<string | boolean | undefined>;       // Optional. Enable debug log by providing a valid local file 
                                                        //    path as log destination
}
