import 'dotenv/config';
import { syncGripoClubsDatabase } from '../src/lib/integrations/gripo-sync';

async function main() {
  console.log('🔄 Iniciando sincronização completa de todos os clubes do Gripo...');
  const result = await syncGripoClubsDatabase();
  console.log(`📍 ${result.totalCities} cidades ativas processadas.`);
  console.log(`🎾 ${result.totalClubs} clubes retornados pelo Gripo.`);
  console.log(`✅ Sucesso! ${result.uniqueClubsCount} clubes únicos foram sincronizados no banco de dados.`);
}

main().catch((err) => {
  console.error('Erro na sincronização:', err);
  process.exit(1);
});
