import { AccessTier, PageBlobAccessTier } from "../generated/artifacts/models";

// https://docs.microsoft.com/en-us/azure/virtual-machines/windows/disks-types#premium-ssd

const GB = 1024 * 1024 * 1024;

const PageBlobAccessTierThreshold = new Map<
  AccessTier | PageBlobAccessTier,
  number
>();

PageBlobAccessTierThreshold.set(AccessTier.P4, 32 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P4, 32 * GB);

PageBlobAccessTierThreshold.set(AccessTier.P6, 64 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P6, 64 * GB);

PageBlobAccessTierThreshold.set(AccessTier.P10, 128 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P10, 128 * GB);

PageBlobAccessTierThreshold.set(AccessTier.P15, 256 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P15, 256 * GB);

PageBlobAccessTierThreshold.set(AccessTier.P20, 512 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P20, 512 * GB);

PageBlobAccessTierThreshold.set(AccessTier.P30, 1024 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P30, 1024 * GB);

PageBlobAccessTierThreshold.set(AccessTier.P40, 2048 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P40, 2048 * GB);

PageBlobAccessTierThreshold.set(AccessTier.P50, 4095 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P50, 4095 * GB);

PageBlobAccessTierThreshold.set(AccessTier.P60, 8192 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P60, 8192 * GB);

PageBlobAccessTierThreshold.set(AccessTier.P70, 16384 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P70, 16384 * GB);

PageBlobAccessTierThreshold.set(AccessTier.P80, 32767 * GB);
PageBlobAccessTierThreshold.set(PageBlobAccessTier.P80, 32767 * GB);

export default PageBlobAccessTierThreshold;
