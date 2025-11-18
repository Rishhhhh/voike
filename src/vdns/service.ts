import fs from 'fs';
import path from 'path';

export type VdnsRecord = {
  type: string;
  name: string;
  value: string;
  ttl?: number;
};

export type VdnsZone = {
  id: string;
  zone: string;
  serial: number;
  ttl: number;
  primaryNs: string;
  admin: string;
  records: VdnsRecord[];
};

export class VdnsService {
  private zones: VdnsZone[] = [];
  constructor(private configPath = path.join(process.cwd(), 'config', 'vdns-zones.json')) {
    this.load();
  }

  private load() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`VDNS config missing at ${this.configPath}`);
    }
    const raw = fs.readFileSync(this.configPath, 'utf-8');
    this.zones = JSON.parse(raw) as VdnsZone[];
  }

  private save() {
    fs.writeFileSync(this.configPath, JSON.stringify(this.zones, null, 2));
  }

  listZones() {
    return this.zones;
  }

  getZone(id: string) {
    return this.zones.find((zone) => zone.id === id) || null;
  }

  upsertZone(zone: VdnsZone) {
    const idx = this.zones.findIndex((z) => z.id === zone.id);
    if (idx >= 0) {
      this.zones[idx] = zone;
    } else {
      this.zones.push(zone);
    }
    this.save();
    return zone;
  }

  addRecord(zoneId: string, record?: VdnsRecord) {
    const zone = this.getZone(zoneId);
    if (!zone) throw new Error(`Zone ${zoneId} not found`);
    if (record) {
      zone.records.push(record);
      zone.serial += 1;
      this.save();
    }
    return zone;
  }

  exportZoneFile(zoneId: string) {
    const zone = this.getZone(zoneId);
    if (!zone) throw new Error(`Zone ${zoneId} not found`);
    const header = `@ ${zone.ttl} IN SOA ${zone.primaryNs} ${zone.admin} (${zone.serial} 7200 3600 1209600 300)`;
    const lines = [header];
    for (const record of zone.records) {
      const ttl = record.ttl || zone.ttl;
      lines.push(`${record.name} ${ttl} IN ${record.type} ${record.value}`);
    }
    return lines.join('\n');
  }
}
