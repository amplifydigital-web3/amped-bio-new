import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { hashPassword } from "../utils/password";
import { prisma } from "../services/DB";

export const adminController = {
  // Get all users
  async userList(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany();

      res.json(users);
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  // Get user by ID
  async getUserById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: {
          id: Number(id),
        },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  // Create a new user
  async createUser(req: Request, res: Response) {
    try {
      const { name, email, password, onelink, description, role } = req.body;

      // Validate required fields
      if (!name || !email || !password || !onelink) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Check if email already exists
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (existingEmail) {
        return res.status(400).json({ message: "Email already in use" });
      }

      // Check if onelink already exists
      const existingOnelink = await prisma.user.findUnique({
        where: { onelink },
      });

      if (existingOnelink) {
        return res.status(400).json({ message: "Onelink name already in use" });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create new user
      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          onelink,
          description,
          role: role || "user",
        },
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = newUser;

      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("error", error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Server error" });
    }
  },

  // Update a user
  async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, email, password, onelink, revoName, description, role, block } = req.body;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: Number(id) },
      });

      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Prepare update data
      const updateData: any = {};

      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (role) updateData.role = role;
      if (block) updateData.block = block;
      if (revoName) updateData.revoName = revoName;

      // If email is being updated, validate and check uniqueness
      if (email && email !== existingUser.email) {
        const existingEmail = await prisma.user.findUnique({
          where: { email },
        });

        if (existingEmail) {
          return res.status(400).json({ message: "Email already in use" });
        }

        updateData.email = email;
      }

      // If onelink is being updated, check uniqueness
      if (onelink && onelink !== existingUser.onelink) {
        const existingOnelink = await prisma.user.findUnique({
          where: { onelink },
        });

        if (existingOnelink) {
          return res.status(400).json({ message: "Onelink name already in use" });
        }

        updateData.onelink = onelink;
      }

      // If password is being updated, hash it
      if (password) {
        updateData.password = await hashPassword(password);
      }

      // Update user
      updateData.updated_at = new Date();

      const updatedUser = await prisma.user.update({
        where: { id: Number(id) },
        data: updateData,
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = updatedUser;

      res.json(userWithoutPassword);
    } catch (error) {
      console.error("error", error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Server error" });
    }
  },

  // Block or unblock a user
  async toggleUserBlock(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { block } = req.body;

      if (block !== "yes" && block !== "no") {
        return res.status(400).json({ message: 'Block status must be "yes" or "no"' });
      }

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: Number(id) },
      });

      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user block status
      const updatedUser = await prisma.user.update({
        where: { id: Number(id) },
        data: {
          block,
          updated_at: new Date(),
        },
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = updatedUser;

      res.json(userWithoutPassword);
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  // Change user role
  async changeUserRole(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role || !["user", "admin"].includes(role)) {
        return res.status(400).json({ message: "Valid role is required" });
      }

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: Number(id) },
      });

      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user role
      const updatedUser = await prisma.user.update({
        where: { id: Number(id) },
        data: {
          role,
          updated_at: new Date(),
        },
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = updatedUser;

      res.json(userWithoutPassword);
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ message: "Server error" });
    }
  },
};
