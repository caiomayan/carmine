using Xunit;

namespace Carmine.Core.Tests;

public class PendingGreetingsTests
{
    private const ulong Player = 76561198000000001;

    [Fact]
    public void Na_escolha_de_time_a_linha_espera_o_primeiro_spawn_e_sai_uma_vez()
    {
        var greetings = new PendingGreetings();

        Assert.Null(greetings.OnConnectResult(Player, "Bem-vindo, Gabriel.", isAlive: false));

        Assert.Equal("Bem-vindo, Gabriel.", greetings.TakeOnSpawn(Player));
        Assert.Null(greetings.TakeOnSpawn(Player));
    }

    [Fact]
    public void Se_o_jogador_ja_esta_vivo_a_linha_sai_na_hora()
    {
        var greetings = new PendingGreetings();

        Assert.Equal("Você fez 41 headshots esta semana.", greetings.OnConnectResult(Player, "Você fez 41 headshots esta semana.", isAlive: true));
        Assert.Null(greetings.TakeOnSpawn(Player));
    }

    [Fact]
    public void Sem_linha_da_API_nao_ha_nada_a_mostrar()
    {
        var greetings = new PendingGreetings();
        greetings.OnConnectResult(Player, "antiga", isAlive: false);

        Assert.Null(greetings.OnConnectResult(Player, null, isAlive: false));
        Assert.Null(greetings.TakeOnSpawn(Player));
    }

    [Fact]
    public void Quem_sai_antes_de_nascer_nao_deixa_linha_para_a_proxima_conexao()
    {
        var greetings = new PendingGreetings();
        greetings.OnConnectResult(Player, "Bem-vindo, Gabriel.", isAlive: false);

        greetings.OnDisconnect(Player);

        Assert.Null(greetings.TakeOnSpawn(Player));
    }
}
