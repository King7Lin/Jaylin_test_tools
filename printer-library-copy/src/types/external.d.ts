// 类型声明兜底：react-native-sqlite-storage（若外部工程未安装 @types，则避免 TS 报错）
declare module 'react-native-sqlite-storage' {
  export type SQLError = any;
  export type ResultSet = { rows: { length: number; item: (i: number) => any }; rowsAffected?: number };
  export interface SQLiteDatabase {
    executeSql(sql: string, params?: any[]): Promise<[ResultSet]>;
    close(): Promise<void>;
  }
  export function openDatabase(opts: { name: string; location: string }): Promise<SQLiteDatabase>;
  export function enablePromise(v: boolean): void;
  export function DEBUG(v: boolean): void;
  const SQLite: {
    openDatabase: typeof openDatabase;
    enablePromise: typeof enablePromise;
    DEBUG: typeof DEBUG;
  };
  export default SQLite;
}


