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
    public void A_Denuncia_leva_o_Mapa_jogado_do_rastreador_em_qualquer_momento_inclusive_no_aquecimento()
    {
        var match = new MatchTracker();
        var first = match.MapPlayId;

        // O MatchTracker já tem um mapa jogado no aquecimento; o !report manda esse mesmo.
        Assert.Equal(first, ReportMapPlay.Current(match));

        // Partida nova (mapa novo, fim do aquecimento, reinício): a Denúncia seguinte leva o novo.
        match.Reset();
        Assert.NotEqual(first, ReportMapPlay.Current(match));
        Assert.Equal(match.MapPlayId, ReportMapPlay.Current(match));
    }

    [Fact]
    public void Sem_o_rastreador_nao_manda_nada()
    {
        Assert.Null(ReportMapPlay.Current(null));
    }

    [Fact]
    public void Sem_as_regras_do_jogo_o_round_e_desconhecido()
    {
        Assert.Null(ReportRound.InProgress(null, warmup: false));
    }
}
