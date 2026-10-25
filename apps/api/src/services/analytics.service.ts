import { Types } from 'mongoose';
import { FootfallEventModel } from '../models/FootfallEvent.js';
import { CameraModel } from '../models/Camera.js';
import { ShopModel, IShopDocument } from '../models/Shop.js';
import { 
  FootfallSummaryResponseData, 
  FootfallTimeseriesResponseData, 
  HourlyTrafficPoint, 
  DataSource, 
  Quality 
} from '@dbi/shared-types';

export class AnalyticsService {
  /**
   * Helper: Parse date string "YYYY-MM-DD" into start and end of day in UTC
   */
  private static getDayBoundsUtc(dateStr?: string): { start: Date; end: Date; formattedDate: string } {
    let baseDate: Date;
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      baseDate = new Date(`${dateStr}T00:00:00.000Z`);
    } else {
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(now.getUTCDate()).padStart(2, '0');
      baseDate = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    }

    const start = new Date(baseDate);
    const end = new Date(baseDate);
    end.setUTCHours(23, 59, 59, 999);

    const formattedDate = start.toISOString().split('T')[0];
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
    const { start, end, formattedDate } = this.getDayBoundsUtc(dateStr);
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
    const { start, end, formattedDate } = this.getDayBoundsUtc(dateStr);
    const shopId = shop._id as Types.ObjectId;

    // Aggregate by hour of the day
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
          hour: { $hour: { date: '$occurredAt', timezone: 'UTC' } },
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
      const bucketDate = new Date(start);
      bucketDate.setUTCHours(h, 0, 0, 0);

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
