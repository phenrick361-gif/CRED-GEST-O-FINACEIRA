// Busca TODAS as linhas de uma consulta Supabase, paginando em blocos de 1000,
// para respeitar o limite padrão do PostgREST (não truncar registros).
export async function fetchAllRows(qb: any): Promise<any[]> {
  const all: any[] = [];
  const size = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await qb.range(from, from + size - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < size) break;
    from += size;
  }
  return all;
}