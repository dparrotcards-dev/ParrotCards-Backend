import { Request, Response, NextFunction } from 'express';
import { LocationService } from '../integrations/location/LocationService';

const locationService = new LocationService();

export class LocationController {
  public async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = (req.query.q as string) || (req.query.query as string) || '';
      const limit = parseInt(req.query.limit as string) || 6;

      if (!query || query.trim().length < 2) {
        res.json({ success: true, results: [] });
        return;
      }

      const results = await locationService.searchLocations(query, limit);
      res.json({
        success: true,
        count: results.length,
        results,
      });
    } catch (err) {
      next(err);
    }
  }
}
