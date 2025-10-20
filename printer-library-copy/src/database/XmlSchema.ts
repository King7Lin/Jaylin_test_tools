/**
 * 轻量级 XML 表结构解析与 SQL 生成（无第三方依赖）
 * --------------------------------------------------
 * 目的：
 * - 以 XML 定义数据库 schema，运行时将 XML 解析为标准 SQLite 建表/建索引 SQL 并执行。
 * - 便于跨项目移植与按需扩展，不强依赖完整的 XSD 或复杂 XML 特性。
 *
 * 支持的 XML 元素（受限子集）：
 * <database>
 *   <table name="print_jobs">
 *     <column name="id" type="TEXT" primaryKey="true" />
 *     <column name="printer_id" type="TEXT" notNull="true" />
 *     ...
 *     <foreignKey column="printer_id" refTable="printers" refColumn="id" />
 *   </table>
 *   <index name="idx_print_jobs_status" table="print_jobs" columns="status" unique="false" />
 * </database>
 *
 * 说明：
 * - primaryKey 支持单列或多列（多列场景将在表级生成 PRIMARY KEY(col1,col2)）。
 * - default 属性值将原样拼接到 SQL（请传入合法 SQL 片段，比如 '0' 或 CURRENT_TIMESTAMP）。
 * - foreignKey 仅支持最基本的 REFERENCES 语法，不带 ON UPDATE/DELETE 规则（可扩展）。
 */

export type XmlTableColumn = {
  name: string;
  type: string;
  primaryKey?: boolean;
  notNull?: boolean;
  default?: string;
};

export type XmlTable = {
  name: string;
  columns: XmlTableColumn[];
  foreignKeys?: Array<{ column: string; refTable: string; refColumn: string }>;
};

export type XmlIndex = {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
};

export type XmlSchema = {
  tables: XmlTable[];
  indexes: XmlIndex[];
};

function getAttr(tag: string, attr: string): string | undefined {
  const m = new RegExp(attr + '="([^"]*)"', 'i').exec(tag);
  return m ? m[1] : undefined;
}

export function parseXmlSchema(xml: string): XmlSchema {
  const cleaned = xml.replace(/<!--([\s\S]*?)-->/g, '').replace(/\r?\n/g, ' ').trim();

  const tables: XmlTable[] = [];
  const indexes: XmlIndex[] = [];

  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tMatch: RegExpExecArray | null;
  while ((tMatch = tableRegex.exec(cleaned))) {
    const tableBlock = tMatch[0];
    const tableOpen = /<table\b[^>]*>/i.exec(tableBlock)?.[0] || '';
    const tableName = getAttr(tableOpen, 'name');
    if (!tableName) continue;
    const columns: XmlTableColumn[] = [];

    const colRegex = /<column\b[^>]*\/>/gi;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = colRegex.exec(tableBlock))) {
      const colTag = cMatch[0];
      const name = getAttr(colTag, 'name');
      const type = getAttr(colTag, 'type');
      if (!name || !type) continue;
      const primaryKey = (/primaryKey="true"/i).test(colTag);
      const notNull = (/notNull="true"/i).test(colTag);
      const defVal = getAttr(colTag, 'default');
      columns.push({ name, type, primaryKey, notNull, default: defVal });
    }

    // foreign keys (optional)
    const fkRegex = /<foreignKey\b[^>]*\/>/gi;
    const foreignKeys: Array<{ column: string; refTable: string; refColumn: string }> = [];
    let fMatch: RegExpExecArray | null;
    while ((fMatch = fkRegex.exec(tableBlock))) {
      const fkTag = fMatch[0];
      const column = getAttr(fkTag, 'column');
      const refTable = getAttr(fkTag, 'refTable');
      const refColumn = getAttr(fkTag, 'refColumn');
      if (column && refTable && refColumn) foreignKeys.push({ column, refTable, refColumn });
    }

    tables.push({ name: tableName, columns, foreignKeys });
  }

  const indexRegex = /<index\b[^>]*\/>/gi;
  let iMatch: RegExpExecArray | null;
  while ((iMatch = indexRegex.exec(cleaned))) {
    const idxTag = iMatch[0];
    const name = getAttr(idxTag, 'name');
    const table = getAttr(idxTag, 'table');
    const columnsAttr = getAttr(idxTag, 'columns');
    const unique = (/unique="true"/i).test(idxTag);
    if (!name || !table || !columnsAttr) continue;
    indexes.push({ name, table, columns: columnsAttr.split(',').map(s => s.trim()).filter(Boolean), unique });
  }

  return { tables, indexes };
}

export function schemaToSql(schema: XmlSchema): { createTables: string[]; createIndexes: string[] } {
  // 将解析好的内存结构转换为 SQLite 的 CREATE TABLE / CREATE INDEX 语句
  const createTables: string[] = [];
  const createIndexes: string[] = [];

  for (const t of schema.tables) {
    const colDefs: string[] = [];
    const pkCols = t.columns.filter(c => c.primaryKey).map(c => c.name);
    for (const c of t.columns) {
      const parts: string[] = [c.name, c.type];
      if (c.notNull) parts.push('NOT NULL');
      if (c.default !== undefined) parts.push('DEFAULT ' + c.default);
      // 如果是单列 PK，直接内联 PRIMARY KEY，复合主键后面统一声明
      if (c.primaryKey && pkCols.length === 1) parts.push('PRIMARY KEY');
      colDefs.push(parts.join(' '));
    }
    if (pkCols.length > 1) {
      colDefs.push('PRIMARY KEY (' + pkCols.join(', ') + ')');
    }
    if (t.foreignKeys && t.foreignKeys.length > 0) {
      for (const fk of t.foreignKeys) {
        colDefs.push(`FOREIGN KEY (${fk.column}) REFERENCES ${fk.refTable} (${fk.refColumn})`);
      }
    }
    const create = `CREATE TABLE IF NOT EXISTS ${t.name} (${colDefs.join(', ')});`;
    createTables.push(create);
  }

  for (const idx of schema.indexes) {
    const unique = idx.unique ? 'UNIQUE ' : '';
    createIndexes.push(`CREATE ${unique}INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} (${idx.columns.join(', ')});`);
  }

  return { createTables, createIndexes };
}

// 默认内置 schema（可被调用方替换）
export const DEFAULT_PRINTER_DB_XML = `
<database>
  <table name="printers">
    <column name="id" type="TEXT" primaryKey="true" />
    <column name="name" type="TEXT" notNull="true" />
    <column name="type" type="TEXT" notNull="true" />
    <column name="connection_params" type="TEXT" notNull="true" />
    <column name="is_enabled" type="INTEGER" />
    <column name="status" type="TEXT" />
    <column name="created_at" type="TEXT" />
    <column name="updated_at" type="TEXT" />
  </table>
  <table name="print_jobs">
    <column name="id" type="TEXT" primaryKey="true" />
    <column name="printer_id" type="TEXT" notNull="true" />
    <column name="data" type="TEXT" notNull="true" />
    <column name="status" type="TEXT" />
    <column name="priority" type="INTEGER" />
    <column name="retry_count" type="INTEGER" />
    <column name="max_retries" type="INTEGER" />
    <column name="created_at" type="TEXT" />
    <column name="started_at" type="TEXT" />
    <column name="completed_at" type="TEXT" />
    <column name="error_message" type="TEXT" />
    <column name="metadata" type="TEXT" />
    <column name="available_at" type="TEXT" />
    <column name="worker_id" type="TEXT" />
    <column name="last_heartbeat_at" type="TEXT" />
    <foreignKey column="printer_id" refTable="printers" refColumn="id" />
  </table>
  <index name="idx_print_jobs_printer_id" table="print_jobs" columns="printer_id" />
  <index name="idx_print_jobs_status" table="print_jobs" columns="status" />
  <index name="idx_print_jobs_priority" table="print_jobs" columns="priority, created_at" />
</database>`;


