using Xunit;

namespace Carmine.Core.Tests;

public class LoadoutNoticesTests
{
    private const ulong SteamId = 76561198000000001;

    [Fact]
    public void Com_a_API_fora_no_connect_o_aviso_sai_no_primeiro_spawn_uma_vez_so()
    {
        var notices = new LoadoutNotices();

        notices.OnConnect(SteamId, apiReachable: false);

        Assert.True(notices.TakeOnSpawn(SteamId));
        Assert.False(notices.TakeOnSpawn(SteamId));
    }

    [Fact]
    public void Com_a_API_no_ar_nao_ha_aviso()
    {
        var notices = new LoadoutNotices();

        notices.OnConnect(SteamId, apiReachable: true);

        Assert.False(notices.TakeOnSpawn(SteamId));
    }

    [Fact]
    public void Se_a_API_volta_antes_do_spawn_o_aviso_some()
    {
        var notices = new LoadoutNotices();
        notices.OnConnect(SteamId, apiReachable: false);

        notices.OnConnect(SteamId, apiReachable: true);

        Assert.False(notices.TakeOnSpawn(SteamId));
    }

    [Fact]
    public void Quem_sai_antes_do_spawn_nao_recebe_o_aviso_no_proximo_connect()
    {
        var notices = new LoadoutNotices();
        notices.OnConnect(SteamId, apiReachable: false);

        notices.OnDisconnect(SteamId);

        Assert.False(notices.TakeOnSpawn(SteamId));
    }
}
