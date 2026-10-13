using Xunit;

namespace Carmine.Core.Tests;

public class ReservedSlotsModeTests
{
    [Theory]
    [InlineData("", ReservedSlotsMode.Off)]
    [InlineData("off", ReservedSlotsMode.Off)]
    [InlineData("retake", ReservedSlotsMode.Retake)]
    [InlineData(" Deathmatch ", ReservedSlotsMode.Deathmatch)]
    public void ReservedSlots_aceita_os_Modos_e_vazio(string value, ReservedSlotsMode expected) =>
        Assert.Equal(expected, ReservedSlots.ParseMode(value));

    [Fact]
    public void ReservedSlots_desconhecido_falha_ao_carregar_a_config() =>
        Assert.Throws<ArgumentException>(() => ReservedSlots.ParseMode("5v5"));
}
