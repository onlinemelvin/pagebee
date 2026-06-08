---
name: backend-patterns
description: Backend architecture patterns, API design, database optimization, and server-side best practices for Node.js, Express, and Next.js API routes. Use when designing REST or GraphQL endpoints, implementing repository/service/controller layers, optimizing database queries, adding caching, or structuring error handling.
origin: ECC
---

# Backend Development Patterns

Backend architecture patterns and best practices for scalable server-side applications.

## When to Activate

- Designing REST or GraphQL API endpoints
- Implementing repository, service, or controller layers
- Optimizing database queries (N+1, indexing, connection pooling)
- Adding caching (Redis, in-memory, HTTP cache headers)
- Setting up background jobs or async processing
- Structuring error handling and validation for APIs
- Building middleware (auth, logging, rate limiting)

## API Design Patterns

### RESTful API Structure

```typescript
// Resource-based URLs
GET    /api/posts                 # List resources
GET    /api/posts/:id             # Get single resource
POST   /api/posts                 # Create resource
PUT    /api/posts/:id             # Replace resource
PATCH  /api/posts/:id             # Update resource
DELETE /api/posts/:id             # Delete resource

// Query parameters for filtering, sorting, pagination
GET /api/posts?status=published&sort=created_at&limit=20&offset=0
```

### Repository Pattern

```typescript
// Abstract data access logic
interface PostRepository {
  findAll(filters?: PostFilters): Promise<Post[]>
  findById(id: string): Promise<Post | null>
  create(data: CreatePostDto): Promise<Post>
  update(id: string, data: UpdatePostDto): Promise<Post>
  delete(id: string): Promise<void>
}

class SupabasePostRepository implements PostRepository {
  async findAll(filters?: PostFilters): Promise<Post[]> {
    let query = supabase.from('posts').select('*')

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data
  }
}
```

### Service Layer Pattern

```typescript
// Business logic separated from data access
class PostService {
  constructor(private postRepo: PostRepository) {}

  async getPublishedPosts(limit: number = 10): Promise<Post[]> {
    const posts = await this.postRepo.findAll({ status: 'published', limit })
    return posts.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }
}
```

### Middleware Pattern

```typescript
// Request/response processing pipeline
export function withAuth(handler: NextApiHandler): NextApiHandler {
  return async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      const user = await verifyToken(token)
      req.user = user
      return handler(req, res)
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }
}
```

## Database Patterns

### Query Optimization

```typescript
// GOOD: Select only needed columns
const { data } = await supabase
  .from('posts')
  .select('id, title, status, created_at')
  .eq('status', 'published')
  .order('created_at', { ascending: false })
  .limit(10)

// BAD: Select everything
const { data } = await supabase.from('posts').select('*')
```

### N+1 Query Prevention

```typescript
// BAD: N+1 - one query per post
const posts = await getPosts()
for (const post of posts) {
  post.author = await getUser(post.author_id) // N queries!
}

// GOOD: Single join query
const { data: posts } = await supabase
  .from('posts')
  .select('*, users(id, name, avatar_url)')
  .eq('status', 'published')
```

### Connection Pooling

```typescript
// Use a singleton client
let supabaseClient: SupabaseClient | null = null

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    )
  }
  return supabaseClient
}
```

## Error Handling

### Consistent Error Responses

```typescript
class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Global error handler
export function handleApiError(error: unknown, res: NextApiResponse) {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code || 'api_error',
        message: error.message
      }
    })
  }

  // Don't expose internal errors to clients
  console.error('Unexpected error:', error)
  return res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'An unexpected error occurred'
    }
  })
}
```

### Async Error Wrapper

```typescript
type AsyncHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>

export function asyncHandler(handler: AsyncHandler): NextApiHandler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      handleApiError(error, res)
    }
  }
}

// Usage
export default asyncHandler(async (req, res) => {
  const post = await postService.findById(req.query.id as string)
  if (!post) throw new ApiError(404, 'Post not found', 'not_found')
  res.json({ data: post })
})
```

## Caching Patterns

### In-Memory Cache

```typescript
const cache = new Map<string, { value: unknown; expiresAt: number }>()

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value as T
}

export function setCache(key: string, value: unknown, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}
```

### HTTP Cache Headers

```typescript
export async function GET(request: Request) {
  const data = await fetchExpensiveData()

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      'ETag': generateETag(data)
    }
  })
}
```

## Authorization Pattern

```typescript
type Permission = 'read' | 'write' | 'delete' | 'admin'
type Role = 'admin' | 'editor' | 'viewer'

const rolePermissions: Record<Role, Permission[]> = {
  admin: ['read', 'write', 'delete', 'admin'],
  editor: ['read', 'write'],
  viewer: ['read']
}

export function requirePermission(permission: Permission) {
  return (handler: (request: Request, user: User) => Promise<Response>) => {
    return async (request: Request) => {
      const user = await requireAuth(request)

      if (!rolePermissions[user.role].includes(permission)) {
        return NextResponse.json(
          { error: { code: 'forbidden', message: 'Insufficient permissions' } },
          { status: 403 }
        )
      }

      return handler(request, user)
    }
  }
}
```

## Rate Limiting

```typescript
class RateLimiter {
  private requests = new Map<string, number[]>()

  checkLimit(identifier: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now()
    const requests = this.requests.get(identifier) || []
    const recentRequests = requests.filter(time => now - time < windowMs)

    if (recentRequests.length >= maxRequests) return false

    recentRequests.push(now)
    this.requests.set(identifier, recentRequests)
    return true
  }
}

const limiter = new RateLimiter()

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'

  if (!limiter.checkLimit(ip, 100, 60000)) {
    return NextResponse.json(
      { error: { code: 'rate_limit_exceeded', message: 'Too many requests' } },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }
  // Handle request...
}
```

## Background Jobs

```typescript
// Simple queue pattern for async processing
class JobQueue<T> {
  private queue: T[] = []
  private processing = false

  async add(job: T): Promise<void> {
    this.queue.push(job)
    if (!this.processing) this.process()
  }

  private async process(): Promise<void> {
    this.processing = true
    while (this.queue.length > 0) {
      const job = this.queue.shift()!
      try {
        await this.execute(job)
      } catch (error) {
        console.error('Job failed:', error)
      }
    }
    this.processing = false
  }

  protected async execute(job: T): Promise<void> {
    throw new Error('Must implement execute()')
  }
}
```

## Structured Logging

```typescript
interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
  requestId?: string
  userId?: string
  [key: string]: unknown
}

const logger = {
  info: (message: string, ctx?: Partial<LogEntry>) =>
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message, ...ctx })),
  warn: (message: string, ctx?: Partial<LogEntry>) =>
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', message, ...ctx })),
  error: (message: string, error: Error, ctx?: Partial<LogEntry>) =>
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', message,
      errorMessage: error.message, stack: error.stack, ...ctx
    }))
}
```

## Observability Pattern

Every API route must include Sentry error capture and PostHog event tracking. Follow this template:

```typescript
import { captureExceptionToSentry, logError, logInfo } from '@/lib/observability'
import { captureServerPosthogEvent } from '@/lib/posthog-server'

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID()
  const route = '/api/feature/action'

  try {
    // ... business logic ...

    await captureServerPosthogEvent({
      event: 'feature_action_completed',
      email: user.email,
      properties: { environment: env.nodeEnv, relevant_prop: value },
      personProperties: { updated_field: newValue },   // if user profile changed
    })

    logInfo('Action succeeded.', { requestId, route })
    return NextResponse.json({ success: true })
  } catch (error) {
    logError('Action failed.', { requestId, route, message: String(error) })
    await captureExceptionToSentry(error, { requestId, route })
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
```

**Rules:**
- `captureExceptionToSentry` goes in every `catch` block — never skip it
- `captureServerPosthogEvent` fires on every successful outcome — use `personProperties` when the action changes what we know about the user
- `logInfo` at success, `logError` at failure — always include `requestId` and `route`
- Event names: snake_case, past tense, feature-prefixed (`post_scheduled`, `idea_created`)

---

## Backend Architecture Checklist

Before shipping any new backend feature:

- [ ] Repository pattern used to abstract data access
- [ ] Service layer contains business logic (not in API routes)
- [ ] All API inputs validated with a schema (Zod)
- [ ] Consistent error response format used
- [ ] N+1 queries avoided (use joins or batch loading)
- [ ] Only needed columns selected from database
- [ ] Authentication middleware applied to protected routes
- [ ] Authorization checks before sensitive operations
- [ ] Rate limiting configured on public endpoints
- [ ] Structured logging added at key decision points (`logInfo`, `logError` from `@/lib/observability`)
- [ ] No secrets hardcoded (all from environment variables)
- [ ] Background jobs used for slow operations (email, indexing, etc.)
- [ ] `captureExceptionToSentry` in every catch block
- [ ] `captureServerPosthogEvent` on every successful outcome
- [ ] `personProperties` passed when the action updates the user profile

**Remember**: Choose patterns that fit your complexity level. Don't over-engineer.
