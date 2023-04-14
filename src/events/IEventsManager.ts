export default interface IEventsManager {
  addEvent(context: any, meta: any): void;
  close(): void;
}
