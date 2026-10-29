using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class VipPlanNoticeTests
{
    private const ulong Player = 76561198000000001;
    private static readonly DateTimeOffset Now = new(2026, 10, 27, 18, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Ends = new(2026, 11, 12, 12, 0, 0, TimeSpan.Zero);

    private static VipInfo Vip() => new(CarmineApi.CreateClient(StubHandler.Options, new StubHandler(_ => new(System.Net.HttpStatusCode.OK))), new FakeTimeProvider(Now));

    [Fact]
    public void Quem_tem_VIP_ativo_num_servidor_aberto_ve_ate_quando_vai_e_que_a_vaga_esta_garantida()
    {
        var vip = Vip();

        vip.OnConnectResult(Player, null, Ends, planNotice: true, isVip: true);

        Assert.Equal("VIP ativo até 12/11 · sua vaga está garantida.", vip.TakeOnSpawn(Player));
        Assert.Null(vip.TakeOnSpawn(Player));
    }

    [Fact]
    public void Quem_nao_tem_VIP_nao_ve_o_aviso()
    {
        var vip = Vip();

        vip.OnConnectResult(Player, null, null, planNotice: true, isVip: false);

        Assert.Null(vip.TakeOnSpawn(Player));
    }

    [Fact]
    public void Fora_de_servidor_aberto_nao_ve_o_aviso()
    {
        var vip = Vip();

        vip.OnConnectResult(Player, null, Ends, planNotice: false, isVip: true);

        Assert.Null(vip.TakeOnSpawn(Player));
    }

    [Fact]
    public void O_aviso_de_fim_do_VIP_substitui_o_do_plano()
    {
        var vip = Vip();

        vip.OnConnectResult(Player, Carmine.Api.Client.VipNotice.Ending_today, Ends, planNotice: true, isVip: true);

        Assert.Equal("Seu VIP acaba hoje. Para renovar: stcarmine.com/vip", vip.TakeOnSpawn(Player));
    }
}
