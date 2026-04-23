const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    await prisma.mapLayout.updateMany({
        data: { isActive: false }
    });
    await prisma.mapLayout.create({
        data: {
            name: "Test Map With Castle",
            size: 40,
            elements: JSON.stringify([
                { id: "1", type: "building", name: "Castle", x: 10, y: 10, width: 4, height: 4, color: "#3b82f6" },
                { id: "2", type: "building", name: "North Turret", x: 15, y: 15, width: 2, height: 2, color: "#ef4444" }
            ]),
            isActive: true
        }
    });
    console.log("Map seeded!");
}
run().catch(console.error).finally(() => prisma.$disconnect());
