using Xunit;

namespace Carmine.Core.Tests;

public class PendingWelcomesTests
{
    private const ulong SteamId = 76561198000000001;

    [Fact]
    public void No_primeiro_connect_ainda_na_escolha_de_time_espera_o_primeiro_spawn()
    {
        var welcomes = new PendingWelcomes(new InMemoryPendingWelcomesStore());

        var sendNow = welcomes.OnConnectResult(SteamId, isFirstConnect: true, isAlive: false);

        Assert.False(sendNow);
        Assert.True(welcomes.TakeOnSpawn(SteamId));
    }

    [Fact]
    public void Sai_uma_vez_so()
    {
        var welcomes = new PendingWelcomes(new InMemoryPendingWelcomesStore());
        welcomes.OnConnectResult(SteamId, isFirstConnect: true, isAlive: false);

        welcomes.TakeOnSpawn(SteamId);

        Assert.False(welcomes.TakeOnSpawn(SteamId));
    }

    [Fact]
    public void Se_o_jogador_ja_esta_vivo_quando_a_API_responde_sai_na_hora()
    {
        var welcomes = new PendingWelcomes(new InMemoryPendingWelcomesStore());

        var sendNow = welcomes.OnConnectResult(SteamId, isFirstConnect: true, isAlive: true);

        Assert.True(sendNow);
        Assert.False(welcomes.TakeOnSpawn(SteamId));
    }

    [Fact]
    public void Nao_ha_boas_vindas_fora_do_primeiro_connect()
    {
        var welcomes = new PendingWelcomes(new InMemoryPendingWelcomesStore());

        Assert.False(welcomes.OnConnectResult(SteamId, isFirstConnect: false, isAlive: true));
        Assert.False(welcomes.TakeOnSpawn(SteamId));
    }

    [Fact]
    public void Um_connect_seguinte_nao_apaga_a_boas_vindas_que_ainda_nao_saiu()
    {
        // A API só diz "primeiro connect" uma vez; se o jogador saiu antes de nascer, é o
        // plugin que lembra.
        var welcomes = new PendingWelcomes(new InMemoryPendingWelcomesStore());
        welcomes.OnConnectResult(SteamId, isFirstConnect: true, isAlive: false);

        var sendNow = welcomes.OnConnectResult(SteamId, isFirstConnect: false, isAlive: false);

        Assert.False(sendNow);
        Assert.True(welcomes.TakeOnSpawn(SteamId));
    }

    [Fact]
    public void Connect_da_fila_com_o_jogador_ja_fora_espera_o_proximo_connect_mesmo_apos_restart()
    {
        var path = Path.Combine(Path.GetTempPath(), $"carmine-welcomes-{Guid.NewGuid():N}.json");
        try
        {
            var before = new PendingWelcomes(new JsonFilePendingWelcomesStore(path));
            before.OnConnectResult(SteamId, isFirstConnect: true, isAlive: false);

            var after = new PendingWelcomes(new JsonFilePendingWelcomesStore(path));

            Assert.True(after.TakeOnSpawn(SteamId));
            Assert.False(new PendingWelcomes(new JsonFilePendingWelcomesStore(path)).TakeOnSpawn(SteamId));
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void Acima_da_capacidade_descarta_a_mais_antiga()
    {
        var welcomes = new PendingWelcomes(new InMemoryPendingWelcomesStore(), capacity: 2);

        welcomes.OnConnectResult(1, isFirstConnect: true, isAlive: false);
        welcomes.OnConnectResult(2, isFirstConnect: true, isAlive: false);
        welcomes.OnConnectResult(3, isFirstConnect: true, isAlive: false);

        Assert.False(welcomes.TakeOnSpawn(1));
        Assert.True(welcomes.TakeOnSpawn(2));
        Assert.True(welcomes.TakeOnSpawn(3));
    }

    [Fact]
    public void Um_arquivo_corrompido_vira_lista_vazia()
    {
        var path = Path.Combine(Path.GetTempPath(), $"carmine-welcomes-{Guid.NewGuid():N}.json");
        try
        {
            File.WriteAllText(path, "{ isto não é json");

            var welcomes = new PendingWelcomes(new JsonFilePendingWelcomesStore(path));

            Assert.False(welcomes.TakeOnSpawn(SteamId));
        }
        finally
        {
            File.Delete(path);
        }
    }
}
