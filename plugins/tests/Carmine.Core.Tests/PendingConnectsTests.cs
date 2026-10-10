using Xunit;

namespace Carmine.Core.Tests;

public class PendingConnectsTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 10, 18, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Reconectar_com_a_API_fora_mantem_o_primeiro_horario_e_o_nome_mais_recente()
    {
        var pending = new PendingConnects(new InMemoryPendingConnectsStore());

        pending.Add(new PendingConnect(1, "antigo", T0));
        pending.Add(new PendingConnect(1, "novo", T0.AddMinutes(5)));

        Assert.Equal([new PendingConnect(1, "novo", T0)], pending.Snapshot());
    }

    [Fact]
    public void Acima_da_capacidade_descarta_o_connect_mais_antigo()
    {
        var pending = new PendingConnects(new InMemoryPendingConnectsStore(), capacity: 2);

        pending.Add(new PendingConnect(1, "a", T0));
        pending.Add(new PendingConnect(2, "b", T0.AddMinutes(1)));
        pending.Add(new PendingConnect(3, "c", T0.AddMinutes(2)));

        Assert.Equal([2UL, 3UL], pending.Snapshot().Select(p => p.SteamId));
    }

    [Fact]
    public void Sobrevive_a_um_restart_do_servidor_pelo_arquivo()
    {
        var path = Path.Combine(Path.GetTempPath(), $"carmine-pending-{Guid.NewGuid():N}.json");
        try
        {
            var before = new PendingConnects(new JsonFilePendingConnectsStore(path));
            before.Add(new PendingConnect(76561198000000001, "coldzera", T0));
            before.Add(new PendingConnect(76561198000000002, "fallen", T0.AddMinutes(1)));
            before.Remove(76561198000000002);

            var after = new PendingConnects(new JsonFilePendingConnectsStore(path));

            Assert.Equal([new PendingConnect(76561198000000001, "coldzera", T0)], after.Snapshot());
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void Um_arquivo_corrompido_vira_fila_vazia_em_vez_de_impedir_o_plugin_de_carregar()
    {
        var path = Path.Combine(Path.GetTempPath(), $"carmine-pending-{Guid.NewGuid():N}.json");
        try
        {
            File.WriteAllText(path, "{ isto não é json");

            var pending = new PendingConnects(new JsonFilePendingConnectsStore(path));

            Assert.Equal(0, pending.Count);
        }
        finally
        {
            File.Delete(path);
        }
    }
}
