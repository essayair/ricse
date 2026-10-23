export interface FleetCarrierLink {
  fleet: { id?: string; name?: string; carrierPartnerId: string | null; status?: string; deletedAt?: string | Date | null };
}
interface TransportChoice { freightMode: string; carrierPartnerId: string }
interface VehicleResource { ownerType: string; owner?: { id: string } | null; fleetLinks?: FleetCarrierLink[] }
interface DriverResource {
  serviceOrganization: { status?: string; partnerId: string; partner: { isInternal: boolean; status?: string } } | null;
  fleetLinks?: FleetCarrierLink[];
}

export function linkedToCarrier(links: FleetCarrierLink[] | undefined, carrierId: string) {
  return Boolean(carrierId) && Boolean(links?.some(({ fleet }) => fleet.carrierPartnerId === carrierId
    && (!fleet.status || fleet.status === 'ACTIVE') && !fleet.deletedAt));
}

export function vehicleMatchesTransport(vehicle: VehicleResource, choice: TransportChoice) {
  if (choice.freightMode === 'SOCIAL') return true;
  if (choice.freightMode === 'SELF') return vehicle.ownerType === 'SELF';
  return Boolean(choice.carrierPartnerId) && ((vehicle.ownerType === 'OUTSOURCED' && vehicle.owner?.id === choice.carrierPartnerId)
    || linkedToCarrier(vehicle.fleetLinks, choice.carrierPartnerId));
}

export function driverMatchesTransport(driver: DriverResource, choice: TransportChoice) {
  const org = driver.serviceOrganization;
  if (org && ((org.status && org.status !== 'ACTIVE') || (org.partner.status && org.partner.status !== 'ACTIVE'))) return false;
  if (choice.freightMode === 'SOCIAL') return true;
  if (choice.freightMode === 'SELF') return Boolean(org?.partner.isInternal);
  return Boolean(choice.carrierPartnerId) && (org?.partnerId === choice.carrierPartnerId
    || linkedToCarrier(driver.fleetLinks, choice.carrierPartnerId));
}
