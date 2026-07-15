declare module "opening_hours" {
  export default class OpeningHours {
    constructor(
      value: string,
      nominatim?: object | null,
      optional?: { tag_key?: string; map?: unknown },
    );
    getState(date?: Date): boolean;
    getNextChange(date?: Date, maxdate?: Date): Date | undefined;
  }
}
