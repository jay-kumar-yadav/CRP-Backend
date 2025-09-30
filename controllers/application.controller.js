import { Application } from "../models/application.model.js";
import { Job } from "../models/job.model.js";
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";

export const applyJob = async (req, res) => {
    try {
        const userId = req.id;
        const jobId = req.params.id;
        if (!jobId) {
            return res.status(400).json({
                message: "Job id is required.",
                success: false
            })
        };
        // check if the user has already applied for the job
        const existingApplication = await Application.findOne({ job: jobId, applicant: userId });

        if (existingApplication) {
            return res.status(400).json({
                message: "You have already applied for this jobs",
                success: false
            });
        }

        // check if the jobs exists
        const job = await Job.findById(jobId);
        if (!job) {
            return res.status(404).json({
                message: "Job not found",
                success: false
            })
        }
        // create a new application
        const newApplication = await Application.create({
            job:jobId,
            applicant:userId,
        });

        job.applications.push(newApplication._id);
        await job.save();
        return res.status(201).json({
            message:"Job applied successfully.",
            success:true
        })
    } catch (error) {
        console.log(error);
    }
};
export const getAppliedJobs = async (req,res) => {
    try {
        const userId = req.id;
        const application = await Application.find({applicant:userId}).sort({createdAt:-1}).populate({
            path:'job',
            options:{sort:{createdAt:-1}},
            populate:{
                path:'company',
                options:{sort:{createdAt:-1}},
            }
        });
        if(!application){
            return res.status(404).json({
                message:"No Applications",
                success:false
            })
        };
        return res.status(200).json({
            application,
            success:true
        })
    } catch (error) {
        console.log(error);
    }
}
// admin dekhega kitna user ne apply kiya hai
export const getApplicants = async (req,res) => {
    try {
        const jobId = req.params.id;
        const job = await Job.findById(jobId).populate({
            path:'applications',
            options:{sort:{createdAt:-1}},
            populate:{
                path:'applicant'
            }
        });
        if(!job){
            return res.status(404).json({
                message:'Job not found.',
                success:false
            })
        };
        return res.status(200).json({
            job, 
            succees:true
        });
    } catch (error) {
        console.log(error);
    }
}
export const updateStatus = async (req,res) => {
    try {
        const {status} = req.body;
        const applicationId = req.params.id;
        if(!status){
            return res.status(400).json({
                message:'status is required',
                success:false
            })
        };

        // find the application by applicantion id
        const application = await Application.findOne({_id:applicationId});
        if(!application){
            return res.status(404).json({
                message:"Application not found.",
                success:false
            })
        };

        // update the status
        application.status = status.toLowerCase();
        await application.save();

        return res.status(200).json({
            message:"Status updated successfully.",
            success:true
        });

    } catch (error) {
        console.log(error);
    }
}

// Get chat messages for an application
export const getChatMessages = async (req, res) => {
    try {
        const applicationId = req.params.id;
        const userId = req.id;

        // Verify the user has access to this application
        const application = await Application.findById(applicationId)
            .populate({
                path: 'job',
                populate: {
                    path: 'company'
                }
            })
            .populate('applicant');

        if (!application) {
            return res.status(404).json({
                message: "Application not found",
                success: false
            });
        }

        // Check if user is either the applicant or the company owner
        const isApplicant = application.applicant._id.toString() === userId;
        const isCompanyOwner = application.job.company.userId.toString() === userId;

        if (!isApplicant && !isCompanyOwner) {
            return res.status(403).json({
                message: "Access denied",
                success: false
            });
        }

        // Get messages for this application
        const messages = await Message.find({ application: applicationId })
            .populate('sender', 'fullname role')
            .populate('receiver', 'fullname role')
            .sort({ createdAt: 1 });

        // Add sender names to each message for easier frontend access
        const messagesWithSenderNames = messages.map(msg => ({
            ...msg.toObject(),
            senderName: msg.sender.fullname
        }));

        return res.status(200).json({
            messages: messagesWithSenderNames,
            success: true
        });

    } catch (error) {
        console.log("Error in getChatMessages:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
            error: error.message
        });
    }
};

// Send a chat message
export const sendChatMessage = async (req, res) => {
    try {
        const { applicationId, content, receiverId } = req.body;
        const senderId = req.id;

        if (!applicationId || !content || !receiverId) {
            return res.status(400).json({
                message: "Application ID, content, and receiver ID are required",
                success: false
            });
        }

        // Verify the application exists and user has access
        const application = await Application.findById(applicationId)
            .populate({
                path: 'job',
                populate: {
                    path: 'company'
                }
            })
            .populate('applicant');

        if (!application) {
            return res.status(404).json({
                message: "Application not found",
                success: false
            });
        }

        // Check if user is either the applicant or the company owner
        const isApplicant = application.applicant._id.toString() === senderId;
        const isCompanyOwner = application.job.company.userId.toString() === senderId;

        if (!isApplicant && !isCompanyOwner) {
            return res.status(403).json({
                message: "Access denied",
                success: false
            });
        }

        // Verify the receiver is the other party in the conversation
        const expectedReceiver = isApplicant 
            ? application.job.company.userId.toString()
            : application.applicant._id.toString();

        if (receiverId !== expectedReceiver) {
            return res.status(400).json({
                message: "Invalid receiver",
                success: false
            });
        }

        // Get sender details
        const sender = await User.findById(senderId).select('fullname role');
        
        // Create the message
        const message = await Message.create({
            application: applicationId,
            sender: senderId,
            receiver: receiverId,
            content: content.trim()
        });

        // Populate the message with sender and receiver details
        await message.populate([
            { path: 'sender', select: 'fullname role' },
            { path: 'receiver', select: 'fullname role' }
        ]);

        // Add sender name to the message object for easier frontend access
        const messageWithSenderName = {
            ...message.toObject(),
            senderName: sender.fullname
        };

        return res.status(201).json({
            message: messageWithSenderName,
            success: true
        });

    } catch (error) {
        console.log("Error in sendChatMessage:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
            error: error.message
        });
    }
};