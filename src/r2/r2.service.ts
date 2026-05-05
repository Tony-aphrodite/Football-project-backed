import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ulid } from 'ulid';
import type { AppConfig } from '../config/configuration';

const PRESIGN_TTL_SECONDS = 300; // 5 min
const MAX_PHOTOS = 8;
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Injectable()
export class R2Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string | undefined;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const r2 = this.config.get('r2', { infer: true });

    if (!r2.accountId || !r2.accessKeyId || !r2.secretAccessKey || !r2.bucketName) {
      throw new InternalServerErrorException('R2 credentials not configured');
    }

    this.bucket    = r2.bucketName;
    this.publicUrl = r2.publicUrl;

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
      },
    });
  }

  async presignUpload(
    listingId: string,
    contentType: string,
    existingCount: number,
  ): Promise<{ uploadUrl: string; key: string }> {
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new InternalServerErrorException('Unsupported content type');
    }
    if (existingCount >= MAX_PHOTOS) {
      throw new InternalServerErrorException(`Maximum ${MAX_PHOTOS} photos per listing`);
    }

    const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
    const key = `listings/${listingId}/${ulid()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: PRESIGN_TTL_SECONDS });
    return { uploadUrl, key };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  publicUrlFor(key: string): string | null {
    return this.publicUrl ? `${this.publicUrl}/${key}` : null;
  }
}
