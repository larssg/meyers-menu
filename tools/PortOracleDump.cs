using System.Text.Json;
using Meyers.Core.Models;
using Meyers.Infrastructure.Services;
using Xunit;

namespace Meyers.Test;

/// <summary>
/// Temporary harness: dumps the C# scraper + calendar output for the foodop fixture
/// so the TypeScript port can be diffed against it. Not part of the real suite.
/// </summary>
public class PortOracleDump
{
    private static readonly DateTime FixtureToday = new(2026, 4, 8);

    [Fact]
    public void Dump()
    {
        var outDir = Environment.GetEnvironmentVariable("PORT_ORACLE_OUT");
        if (string.IsNullOrEmpty(outDir)) return;
        Directory.CreateDirectory(outDir);

        var html = File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "TestData",
            "meyers-menu-page-foodop.html"));

        var menuDays = MenuScrapingService.ParseNuxtData(html, FixtureToday);

        var opts = new JsonSerializerOptions { WriteIndented = true };
        File.WriteAllText(Path.Combine(outDir, "menudays.json"), JsonSerializer.Serialize(
            menuDays.Select(m => new
            {
                dayName = m.DayName,
                date = m.Date.ToString("yyyy-MM-dd"),
                menuItems = m.MenuItems,
                mainDish = m.MainDish,
                details = m.Details,
                menuType = m.MenuType
            }), opts));

        var calendarService = new CalendarService();

        // One feed per menu type, plus an alarm variant, mirroring the real endpoints.
        foreach (var typeName in menuDays.Select(m => m.MenuType).Distinct())
        {
            var days = menuDays.Where(m => m.MenuType == typeName).OrderBy(m => m.Date).ToList();
            var slug = MenuType.GenerateSlug(typeName);
            File.WriteAllText(Path.Combine(outDir, $"{slug}.ics"),
                calendarService.GenerateCalendar(days, typeName));
            File.WriteAllText(Path.Combine(outDir, $"{slug}.alarm.ics"),
                calendarService.GenerateCalendar(days, typeName, true));
        }

        // Empty-input placeholder event.
        File.WriteAllText(Path.Combine(outDir, "_empty.ics"),
            calendarService.GenerateCalendar([], "Custom Menu Selection"));

        Assert.NotEmpty(menuDays);
    }
}
