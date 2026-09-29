import { GET as ready } from "./ready/route";

export const dynamic = "force-dynamic";

// Alias of /api/health/ready for simple health checks (docker-compose, load balancers).
export const GET = ready;
