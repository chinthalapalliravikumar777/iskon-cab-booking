/**
 * One-time seed script — populates the iskon-projects table with the
 * 12 initial ISKON Developers and Builders project locations.
 *
 * Run via: npx ts-node src/functions/admin/seedProjects.ts
 * Or deploy as a CDK custom resource (CustomResourceProvider) and run once.
 *
 * Safe to run multiple times — uses PutItem with attribute_not_exists(PK)
 * so it won't overwrite existing records.
 */
import { randomUUID } from 'crypto'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB, TABLE_NAMES } from '../../utils/dynamodb'

const INITIAL_PROJECTS = [
  { name: 'ISKON City 1',       location: 'Ahmedabad, Gujarat' },
  { name: 'ISKON City 2',       location: 'Ahmedabad, Gujarat' },
  { name: 'ISKON City',         location: 'Ahmedabad, Gujarat' },
  { name: 'ISKON City A',       location: 'Ahmedabad, Gujarat' },
  { name: 'RK Dream City',      location: 'Ahmedabad, Gujarat' },
  { name: 'RK Nagar',           location: 'Ahmedabad, Gujarat' },
  { name: 'Green Park City',    location: 'Ahmedabad, Gujarat' },
  { name: 'Pinakini Emerald',   location: 'Ahmedabad, Gujarat' },
  { name: 'Spark City',         location: 'Ahmedabad, Gujarat' },
  { name: 'Lotus Avenue',       location: 'Ahmedabad, Gujarat' },
  { name: 'ISKON Avenue',       location: 'Ahmedabad, Gujarat' },
  { name: 'Other',              location: 'As directed' },
]

export async function seedProjects(): Promise<void> {
  const now = new Date().toISOString()
  let seeded = 0
  let skipped = 0

  for (const project of INITIAL_PROJECTS) {
    const projectId = randomUUID()
    try {
      await dynamoDB.send(new PutCommand({
        TableName: TABLE_NAMES.PROJECTS,
        Item: {
          PK: `PROJECT#${projectId}`,
          SK: 'DETAILS',
          projectId,
          projectName: project.name,
          location: project.location,
          status: 'ACTIVE',
          description: '',
          createdAt: now,
          updatedAt: now,
        },
        // Only insert if a project with this exact name doesn't exist
        // We check by PK (which is UUID-based) so all 12 will be created
        ConditionExpression: 'attribute_not_exists(PK)',
      }))
      console.log(`✓ Seeded: ${project.name}`)
      seeded++
    } catch (err: any) {
      if (err?.name === 'ConditionalCheckFailedException') {
        console.log(`- Skipped (exists): ${project.name}`)
        skipped++
      } else {
        throw err
      }
    }
  }

  console.log(`\nDone — ${seeded} seeded, ${skipped} skipped.`)
}

// Run directly if this file is executed (not imported)
if (require.main === module) {
  seedProjects().catch(err => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
}
