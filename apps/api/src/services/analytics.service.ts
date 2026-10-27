import { Types } from 'mongoose';
import { FootfallEventModel } from '../models/FootfallEvent.js';
import { CameraModel } from '../models/Camera.js';
import { ShopModel, IShopDocument } from '../models/Shop.js';
import { zonedTimeToUtc, isValidTimeZone } from '../utils/timezone.js';
import { 
  FootfallSummaryResponseData, 
  FootfallTimeseriesResponseData, 
  HourlyTrafficPoint, 
  DataSource, 
  Quality 
} from '@dbi/shared-types';

export class AnalyticsService {
  /**
   * Helper: resolve "YYYY-MM-DD" (or today, in the shop's own local calendar) into the
   * UTC instants that bound that LOCAL day for the shop's timezone - not UTC midnight.
   * A UTC-midnight day boundary put Indian stores' (UTC+5:30) footfall from the first
   * 5.5 hours of their actual day into the previous day's bucket; this fixes that.
   */
  private static getDayBoundsUtc(
    timeZone: string,
    dateStr?: string
  ): { start: Date; end: Date; formattedDate: string } {
    const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';

    let year: number, month: number, day: number;
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      [year, month, day] = dateStr.split('-').map(Number);
    } else {
      // "Today" as understood in the shop's own local calendar, not UTC's.
      const parts: Record<string, string> = {};
      for (const part of new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date())) {
        if (part.type !== 'literal') parts[part.type] = part.value;
      }
      year = Number(parts.year);
      month = Number(parts.month);
      day = Number(parts.day);
    }

    const start = zonedTimeToUtc(year, month, day, 0, 0, 0, zone);
    const end = zonedTimeToUtc(year, month, day, 23, 59, 59, zone);
    end.setUTCMilliseconds(999);

    const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { start, end, formattedDate };
  }

  /**
   * Determine dataSource (LIVE vs DEMO) and quality based on camera statuses
   */
  private static async getSourceAndQuality(shopId: Types.ObjectId): Promise<{ dataSource: DataSource; quality: Quality }> {
    const cameras = await CameraModel.find({ shopId });
    if (cameras.length === 0) {
      return { dataSource: 'DEMO', quality: 'DEGRADED' };
    }

    // Must be a genuine video source (RTSP/HTTP_STREAM/WEBCAM — never TEST_CLIP/MOCK_STREAM) and ONLINE to claim LIVE
    const liveConnectionTypes = new Set(['RTSP', 'HTTP_STREAM', 'WEBCAM']);
    const hasLiveOnline = cameras.some(
      (c) => liveConnectionTypes.has(c.connectionType) && c.status === 'ONLINE'
    );

    const dataSource: DataSource = hasLiveOnline ? 'LIVE' : 'DEMO';

    const hasOfflineOrConfigError = cameras.some(
      (c) => c.status === 'OFFLINE' || c.status === 'CONFIG_ERROR'
    );

    let quality: Quality = 'OK';
    if (hasOfflineOrConfigError) {
      quality = 'DEGRADED';
    }

    return { dataSource, quality };
  }

  /**
   * Calculate real-time footfall summary for a given shop and date
   */
  public static async getSummary(
    shop: IShopDocument,
    dateStr?: string
  ): Promise<FootfallSummaryResponseData> {
    const { start, end, formattedDate } = this.getDayBoundsUtc(shop.timezone, dateStr);
    const shopId = shop._id as Types.ObjectId;

    // Aggregate entries (IN) and exits (OUT) for the shop within day bounds
    const eventCounts = await FootfallEventModel.aggregate([
      {
        $match: {
          shopId,
          occurredAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: '$direction',
          count: { $sum: 1 },
        },
      },
    ]);

    let entries = 0;
    let exits = 0;

    for (const item of eventCounts) {
      if (item._id === 'IN') entries = item.count;
      if (item._id === 'OUT') exits = item.count;
    }

    const baseline = shop.occupancyBaseline || 0;
    const rawOccupancy = baseline + entries - exits;
    const estimatedOccupancy = Math.max(0, rawOccupancy);

    const { dataSource, quality } = await this.getSourceAndQuality(shopId);

    // If raw occupancy dipped below zero, drift has occurred
    const finalQuality = rawOccupancy < 0 ? 'RESET_REQUIRED' : quality;

    return {
      shopId: shopId.toString(),
      date: formattedDate,
      entries,
      exits,
      estimatedOccupancy,
      occupancyBaseline: baseline,
      dataSource,
      quality: finalQuality,
      lastCalculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate 24-hour timeseries data points for charts
   */
  public static async getTimeseries(
    shop: IShopDocument,
    dateStr?: string
  ): Promise<FootfallTimeseriesResponseData> {
    const zone = isValidTimeZone(shop.timezone) ? shop.timezone : 'UTC';
    const { start, end, formattedDate } = this.getDayBoundsUtc(zone, dateStr);
    const shopId = shop._id as Types.ObjectId;

    // Aggregate by hour of the day, in the SHOP's local timezone (MongoDB's $hour
    // accepts an IANA zone name directly) - grouping by UTC hour would put an Indian
    // store's (UTC+5:30) evening traffic under the wrong hour on the chart.
    const hourlyEvents = await FootfallEventModel.aggregate([
      {
        $match: {
          shopId,
          occurredAt: { $gte: start, $lte: end },
        },
      },
      {
        $project: {
          direction: 1,
          hour: { $hour: { date: '$occurredAt', timezone: zone } },
        },
      },
      {
        $group: {
          _id: { hour: '$hour', direction: '$direction' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Map into lookup: hour -> { in: number, out: number }
    const hourMap: Record<number, { in: number; out: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourMap[h] = { in: 0, out: 0 };
    }

    for (const row of hourlyEvents) {
      const h = row._id.hour;
      if (h >= 0 && h < 24) {
        if (row._id.direction === 'IN') hourMap[h].in = row.count;
        if (row._id.direction === 'OUT') hourMap[h].out = row.count;
      }
    }

    // Build cumulative points
    let cumulativeOccupancy = shop.occupancyBaseline || 0;
    const points: HourlyTrafficPoint[] = [];

    for (let h = 0; h < 24; h++) {
      const hourStr = `${String(h).padStart(2, '0')}:00`;
      // `start` is the UTC instant of the shop's local midnight, which for a
      // half-hour-offset zone (e.g. Asia/Kolkata, UTC+5:30) does not fall on a whole
      // UTC hour - setUTCHours(h) would silently snap it to the wrong instant, so
      // this adds a plain h-hour duration instead.
      const bucketDate = new Date(start.getTime() + h * 60 * 60 * 1000);

      const inCount = hourMap[h].in;
      const outCount = hourMap[h].out;
      const net = inCount - outCount;
      cumulativeOccupancy = Math.max(0, cumulativeOccupancy + net);

      points.push({
        hour: hourStr,
        bucketStartUtc: bucketDate.toISOString(),
        entries: inCount,
        exits: outCount,
        net,
        estimatedOccupancy: cumulativeOccupancy,
      });
    }

    return {
      shopId: shopId.toString(),
      date: formattedDate,
      points,
    };
  }

  /**
   * Generate CSV format for export
   */
  public static async generateCsv(
    shop: IShopDocument,
    dateStr?: string
  ): Promise<string> {
    const timeseries = await this.getTimeseries(shop, dateStr);
    const summary = await this.getSummary(shop, dateStr);

    let csv = `Shop Name,"${shop.name}"\n`;
    csv += `Shop ID,"${shop._id}"\n`;
    csv += `Date,"${timeseries.date}"\n`;
    csv += `Occupancy Baseline,${summary.occupancyBaseline}\n`;
    csv += `Total Entries,${summary.entries}\n`;
    csv += `Total Exits,${summary.exits}\n`;
    csv += `Final Estimated Occupancy,${summary.estimatedOccupancy}\n`;
    csv += `Data Source,${summary.dataSource}\n\n`;

    csv += `Hour,Bucket Start (UTC),Entries (IN),Exits (OUT),Net Flow,Estimated Occupancy\n`;
    for (const pt of timeseries.points) {
      csv += `"${pt.hour}","${pt.bucketStartUtc}",${pt.entries},${pt.exits},${pt.net},${pt.estimatedOccupancy}\n`;
    }

    return csv;
  }
}
