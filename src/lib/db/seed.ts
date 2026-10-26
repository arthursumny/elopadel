import 'dotenv/config';
async function main() {
  console.log('Banco mantido vazio. Cadastre clubes pelo painel administrativo e deixe os jogadores criarem as próprias contas.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
