using Xunit;

namespace Carmine.Core.Tests;

public class ReportRoundTests
{
    [Theory]
    [InlineData(0, 1)]
    [InlineData(7, 8)]
    [InlineData(49, 50)]
    public void O_round_em_andamento_e_o_seguinte_ao_ultimo_terminado(int finished, int expected)
    {
        Assert.Equal(expected, ReportRound.InProgress(finished, warmup: false));
    }

    [Fact]
    public void No_aquecimento_nao_ha_round_valendo()
    {
        Assert.Null(ReportRound.InProgress(0, warmup: true));
    }

    [Fact]
    public void Sem_as_regras_do_jogo_o_round_e_desconhecido()
    {
        Assert.Null(ReportRound.InProgress(null, warmup: false));
    }
}
